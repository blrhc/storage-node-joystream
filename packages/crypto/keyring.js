/*
 * This file is part of the storage node for the Joystream project.
 * Copyright (C) 2019 Joystream Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

'use strict';

const { Keyring } = require('@polkadot/keyring');
const { waitReady } = require('@polkadot/wasm-crypto');
const polka_decode = require('@polkadot/keyring/pair/decode').default;

const util = require('@polkadot/util');
const util_crypto = require('@polkadot/util-crypto');

const sodium = require('sodium').api;

const KEY_TYPES = ['ed25519', 'sr25519'];

/*
 * Extend polkadot key ring with waiting for the crypto API to be ready, so that
 * it can be used outside of the main polkadot API, too.
 *
 * Also add a few convenient methods polkadot fails to expose to the caller.
 *
 * Technically, not all of that belongs in a key ring - some should be part of
 * the key pair. But this beats extending more classes...
 */
class JSKeyring extends Keyring
{
  constructor(...args)
  {
    super(...args);
  }

  /*
   * Use create() instead of constructor to ensure crypto API is initialized.
   */
  static async create(...args)
  {
    await waitReady();
    return new JSKeyring(...args);
  }

  /*
   * Create and return key pair from seed.
   */
  from_seed(type, seed)
  {
    if (typeof seed === 'string') {
      seed = util.hexToU8a(seed);
    }

    const result = {
      type: type,
      compatibility: 'polkadot',
    };
    var pair;
    if (type === 'sr25519') {
      pair = util_crypto.schnorrkelKeypairFromSeed(seed);
    }
    else {
      pair = util_crypto.naclKeypairFromSeed(seed);
    }

    Object.assign(result, pair);
    return result;
  }

  /*
   * Converts from a @polkadot/keyring style key pair to the kind of raw
   * key we're using here.
   */
  convert_from_polkadot(key)
  {
    // Simple stuff first
    const result = {
      type: key.type,
      compatibility: 'polkadot',
      publicKey: key.publicKey(),
    };

    // Getting at the secret is a little bit involved, because it's well
    // hidden inside the polkadot key pair. But it gets exposed by encoding
    // the pair to JSON.
    try {
      const json = key.toJson('');
      const decoded = polka_decode('', util.hexToU8a(json.encoded));
      Object.assign(result, decoded);
    } catch (err) {
      // No secret key.
    }

    return result;
  }

  /*
   * Convert key pair for use with sodium's functions.
   */
  convert_keypair(key)
  {
    if (key.type === 'sr25519') {
      throw new Error('Can only convert ed25519 keys at the moment!');
    }
    if (key.compatibility === 'nacl') {
      return key;
    }

    // Looks like we have a polkadot key here.
    if (!key.compatibility) {
      key = this.convert_from_polkadot(key);
    }

    const result = {};
    Object.assign(result, this.convert_pubkey(key));
    if (key.secretKey) {
      Object.assign(result, this.convert_seckey(key));
    }
    return result;
  }

  convert_pubkey(pubkey)
  {
    if (pubkey.type === 'sr25519') {
      throw new Error('Can only convert ed25519 keys at the moment!');
    }
    if (pubkey.compatibility === 'nacl') {
      return pubkey;
    }

    // Looks like we have a polkadot key here.
    if (!pubkey.compatibility) {
      pubkey = this.convert_from_polkadot(pubkey);
    }

    const keybuf = util.u8aToBuffer(pubkey.publicKey);
    const converted = sodium.crypto_sign_ed25519_pk_to_curve25519(keybuf);

    const result = {
      type: pubkey.type,
      compatibility: 'nacl',
      publicKey: converted,
    };

    return result;
  }

  convert_seckey(seckey)
  {
    if (seckey.type === 'sr25519') {
      throw new Error('Can only convert ed25519 keys at the moment!');
    }
    if (seckey.compatibility === 'nacl') {
      return seckey;
    }

    // Looks like we have a polkadot key here.
    if (!seckey.compatibility) {
      seckey = this.convert_from_polkadot(seckey);
    }

    const keybuf = util.u8aToBuffer(seckey.secretKey);
    const converted = sodium.crypto_sign_ed25519_sk_to_curve25519(keybuf);

    const result = {
      type: seckey.type,
      compatibility: 'nacl',
      secretKey: converted,
    };

    return result;
  }
}

module.exports = {
  Keyring: JSKeyring,
  KEY_TYPES: KEY_TYPES,
}
