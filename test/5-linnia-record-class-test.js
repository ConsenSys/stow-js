import { assert } from 'chai';
import Web3 from 'web3';
import Linnia from '../src';

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:7545'));
const testData = 'foobar';
const testDataHash = '0x38d18acb67d25c8bb9942764b62f18e17054f66a817bd4295423adf9ed98873e';
// TODO: replace this with non-raw string like
// /ipfs/QmUMqi1rr4Ad1eZ3ctsRUEmqK2U3CyZqpetUe51LB9GiAM
// when contract artifacts are updated
const testDataUri = '0x59742369c54039d5611d84452aa6c31b72da336b76ed4029b12c3dc5479836ba';
const testMetaData = 'Blood_Pressure';
const testSharedUri = '0xde1f76340a34698d41d362010bbc3c05c26f25d659904ef08ef7bd5eac0dbea4';
const privKey = '0x5230a384e9d271d59a05a9d9f94b79cd98fcdcee488d1047c59057046e128d2b';
const pubKey = '0xb1f26f98d374540eac3d31208f13a3935318e228207084c9ee32d741ff1ad2341af4ac9658aba4a254bf1dc6451b3c08524febba5273bec227c73e25cd376387';

describe('Record class', () => {
  const [admin, user1, user2, user3, provider] = web3.eth.accounts;
  let linnia;
  let contracts;
  beforeEach('deploy the contracts and set up roles', async () => {
    linnia = await Linnia.deploy(web3, null, {
      from: admin,
      gas: 4000000,
    });
    contracts = await linnia.getContractInstances();
    await contracts.users.register({ from: user1 });
    await contracts.users.register({ from: user2 });
    await contracts.users.register({ from: provider });
    await contracts.users.setProvenance(provider, 1, { from: admin });
    // append a signed file
    await contracts.records.addRecordByProvider(
      testDataHash, user1, testMetaData,
      testDataUri, {
        from: provider,
        gas: 500000,
      },
    );
    // share the file with user2
    await contracts.permissions.grantAccess(testDataHash, user2, testSharedUri, {
      from: user1,
    });
  });
  describe('get attestation', () => {
    it('should return true if attested by specified user', async () => {
      const record = await linnia.getRecord(testDataHash);
      const at = await record.getAttestation(provider);
      assert.isTrue(at);
    });
    it('should return false if not attested by specified user', async () => {
      const record = await linnia.getRecord(testDataHash);
      const at = await record.getAttestation(user2);
      assert.isFalse(at);
    });
  });
  describe('get permission', () => {
    it('should return true if viewer has permission', async () => {
      const record = await linnia.getRecord(testDataHash);
      const perm = await record.getPermission(user2);
      assert.isTrue(perm.canAccess);
      assert.equal(perm.dataUri, testSharedUri);
    });
    it('should return false if viewer does not have permission', async () => {
      const record = await linnia.getRecord(testDataHash);
      const perm = await record.getPermission(user3);
      assert.isFalse(perm.canAccess);
      // XXX
      assert.equal(perm.dataUri, `0x${'00'.repeat(32)}`);
    });
  });
  describe('decrypt', () => {
    it('should decrypt the data if hash is correct', async () => {
      // make the URI resolver always return the encrypted data
      const uriResolver = (dataUri) => {
        assert.equal(dataUri, testDataUri);
        return Linnia.util.encrypt(pubKey, testData);
      };
      const record = await linnia.getRecord(testDataHash);
      const plain = await record.decryptData(privKey, uriResolver);
      assert.equal(plain.toString(), testData);
    });
    it('should throw if hash does not match', async () => {
      // make the URI resolver return a decryptable but wrong data
      const uriResolver = () => Linnia.util.encrypt(pubKey, 'fox');
      const record = await linnia.getRecord(testDataHash);
      try {
        await record.decryptData(privKey, uriResolver);
        assert.fail('expected hash mismatch error not received');
      } catch (error) {
        assert.equal(error.message, 'plaintext data hash mismatch');
      }
    });
  });
  describe('decrypt permissioned', () => {
    it('should decrypt the data if has permission and hash is correct', async () => {
      const uriResolver = (dataUri) => {
        assert.equal(dataUri, testSharedUri);
        return Linnia.util.encrypt(pubKey, testData);
      };
      const record = await linnia.getRecord(testDataHash);
      const plain = await record.decryptPermissioned(user2, privKey, uriResolver);
      assert.equal(plain.toString(), testData);
    });
    it('should throw if viewer has no permission', async () => {
      const uriResolver = () => Linnia.util.encrypt(pubKey, testData);
      const record = await linnia.getRecord(testDataHash);
      try {
        await record.decryptPermissioned(user3, privKey, uriResolver);
        assert.fail('expected permission error not received');
      } catch (error) {
        assert.equal(error.message, 'viewer has no permission to view the data');
      }
    });
    it('should throw if hash does not match', async () => {
      // make the URI resolver return a decryptable but wrong data
      const uriResolver = () => Linnia.util.encrypt(pubKey, 'fox');
      const record = await linnia.getRecord(testDataHash);
      try {
        await record.decryptPermissioned(user2, privKey, uriResolver);
        assert.fail('expected hash mismatch error not received');
      } catch (error) {
        assert.equal(error.message, 'plaintext data hash mismatch');
      }
    });
  });
  describe('verify data', () => {
    it('should return true if data hash matches', async () => {
      const record = await linnia.getRecord(testDataHash);
      const verify = record.verifyData('foobar');
      assert.isTrue(verify);
    });
    it('should return true if data hash does not match', async () => {
      const record = await linnia.getRecord(testDataHash);
      const verify = record.verifyData('fox');
      assert.isFalse(verify);
    });
  });
});
