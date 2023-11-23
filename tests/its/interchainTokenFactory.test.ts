import { afterEach, assert, beforeEach, test } from 'vitest';
import { assertAccount, e, SWallet, SWorld } from 'xsuite';
import {
  CHAIN_NAME_HASH,
  OTHER_CHAIN_NAME,
  TOKEN_ID,
  TOKEN_ID2,
  TOKEN_ID_CANONICAL,
  TOKEN_ID_MANAGER_ADDRESS
} from '../helpers';
import {
  computeStandardizedTokenId,
  deployContracts,
  gasService,
  gateway,
  interchainTokenFactory,
  its,
  tokenManagerLockUnlock,
  tokenManagerMintBurn
} from '../itsHelpers';

let world: SWorld;
let deployer: SWallet;
let collector: SWallet;
let user: SWallet;
let otherUser: SWallet;

beforeEach(async () => {
  world = await SWorld.start();
  world.setCurrentBlockInfo({
    nonce: 0,
    epoch: 0
  });

  collector = await world.createWallet();
  deployer = await world.createWallet({
    balance: 10_000_000_000n,
    kvs: [
      e.kvs.Esdts([
        {
          id: TOKEN_ID,
          amount: 100_000
        },
        {
          id: TOKEN_ID2,
          amount: 10_000
        }
      ])
    ]
  });
  user = await world.createWallet({
    balance: BigInt('10000000000000000'),
    kvs: [
      e.kvs.Esdts([
        {
          id: TOKEN_ID,
          amount: 100_000
        },
        {
          id: TOKEN_ID2,
          amount: 10_000
        }
      ])
    ]
  });
  otherUser = await world.createWallet({
    balance: BigInt('10000000000000000')
  });

  await deployContracts(deployer, collector);
});

afterEach(async () => {
  await world.terminate();
});

test.skip('Register canonical token', async () => {
  const result = await user.callContract({
    callee: its,
    funcName: 'registerCanonicalToken',
    gasLimit: 20_000_000,
    funcArgs: [
      e.Str(TOKEN_ID)
    ]
  });

  const computedTokenId = computeStandardizedTokenId();

  assert(result.returnData[0] === computedTokenId);

  const kvs = await its.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 0n,
    allKvs: [
      e.kvs.Mapper('gateway').Value(gateway),
      e.kvs.Mapper('gas_service').Value(gasService),
      e.kvs.Mapper('remote_address_validator').Value(interchainTokenFactory),
      e.kvs.Mapper('implementation_mint_burn').Value(tokenManagerMintBurn),
      e.kvs.Mapper('implementation_lock_unlock').Value(tokenManagerLockUnlock),

      e.kvs.Mapper('chain_name_hash').Value(e.Bytes(CHAIN_NAME_HASH)),

      e.kvs.Mapper('token_manager_address', e.Bytes(computedTokenId)).Value(e.Addr(TOKEN_ID_MANAGER_ADDRESS))
    ]
  });

  const tokenManager = await world.newContract(TOKEN_ID_MANAGER_ADDRESS);
  const tokenManagerKvs = await tokenManager.getAccountWithKvs();
  assertAccount(tokenManagerKvs, {
    balance: 0n,
    allKvs: [
      e.kvs.Mapper('token_id').Value(e.Bytes(computedTokenId)),
      e.kvs.Mapper('token_identifier').Value(e.Str(TOKEN_ID)),
      e.kvs.Mapper('interchain_token_service').Value(its),
      e.kvs.Mapper('operator').Value(its)
    ]
  });

  // Assert that token manager is not of type mint/burn, which has this function
  await user.callContract({
    callee: tokenManager,
    funcName: 'deployStandardizedToken',
    gasLimit: 10_000_000,
    funcArgs: []
  }).assertFail({ code: 1, message: 'invalid function (not found)' });
});

test.skip('Register canonical token errors', async () => {
  await user.callContract({
    callee: its,
    funcName: 'registerCanonicalToken',
    gasLimit: 20_000_000,
    funcArgs: [
      e.Str('NOTTOKEN')
    ]
  }).assertFail({ code: 4, message: 'Invalid token identifier' });

  await user.callContract({
    callee: its,
    funcName: 'registerCanonicalToken',
    gasLimit: 20_000_000,
    funcArgs: [
      e.Str(TOKEN_ID)
    ]
  });

  // Can not register same canonical token twice
  await otherUser.callContract({
    callee: its,
    funcName: 'registerCanonicalToken',
    gasLimit: 20_000_000,
    funcArgs: [
      e.Str(TOKEN_ID)
    ]
  }).assertFail({ code: 4, message: 'Token manager already exists' });
});

test.skip('Deploy remote canonical token', async () => {
  // Register canonical token first
  await user.callContract({
    callee: its,
    funcName: 'registerCanonicalToken',
    gasLimit: 20_000_000,
    funcArgs: [
      e.Str(TOKEN_ID)
    ]
  });

  await user.callContract({
    callee: its,
    funcName: 'deployRemoteCanonicalToken',
    gasLimit: 150_000_000,
    value: 100_000_000n,
    funcArgs: [
      e.Bytes(TOKEN_ID_CANONICAL),
      e.Str(OTHER_CHAIN_NAME)
    ]
  });

  const kvs = await its.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 100_000_000n,
    kvs: [
      e.kvs.Mapper('gateway').Value(gateway),
      e.kvs.Mapper('gas_service').Value(gasService),
      e.kvs.Mapper('remote_address_validator').Value(interchainTokenFactory),
      e.kvs.Mapper('implementation_mint_burn').Value(tokenManagerMintBurn),
      e.kvs.Mapper('implementation_lock_unlock').Value(tokenManagerLockUnlock),

      e.kvs.Mapper('chain_name_hash').Value(e.Bytes(CHAIN_NAME_HASH)),

      e.kvs.Mapper('token_manager_address', e.Bytes(TOKEN_ID_CANONICAL)).Value(e.Addr(TOKEN_ID_MANAGER_ADDRESS)),

      // This seems to work fine on devnet
      e.kvs.Mapper('CB_CLOSURE................................').Value(e.Tuple(
        e.Str('deploy_remote_token_callback'),
        e.Bytes('0000000500000020'),
        e.Bytes(TOKEN_ID_CANONICAL),
        e.Str(TOKEN_ID),
        e.Str(OTHER_CHAIN_NAME),
        e.U(100_000_000n),
        e.Buffer(user.toTopBytes())
      ))
    ]
  });
});

test.skip('Deploy remote canonical token EGLD', async () => {
  // Register canonical token first
  const result = await user.callContract({
    callee: its,
    funcName: 'registerCanonicalToken',
    gasLimit: 20_000_000,
    funcArgs: [
      e.Str('EGLD')
    ]
  });

  await user.callContract({
    callee: its,
    funcName: 'deployRemoteCanonicalToken',
    gasLimit: 150_000_000,
    value: 100_000_000n,
    funcArgs: [
      e.Bytes(result.returnData[0]),
      e.Str(OTHER_CHAIN_NAME)
    ]
  });

  const kvs = await its.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 0,
    kvs: [
      e.kvs.Mapper('gateway').Value(gateway),
      e.kvs.Mapper('gas_service').Value(gasService),
      e.kvs.Mapper('remote_address_validator').Value(interchainTokenFactory),
      e.kvs.Mapper('implementation_mint_burn').Value(tokenManagerMintBurn),
      e.kvs.Mapper('implementation_lock_unlock').Value(tokenManagerLockUnlock),

      e.kvs.Mapper('chain_name_hash').Value(e.Bytes(CHAIN_NAME_HASH)),

      e.kvs.Mapper('token_manager_address', e.Bytes(result.returnData[0])).Value(e.Addr(TOKEN_ID_MANAGER_ADDRESS))
    ]
  });

  // Assert gas was paid for cross chain call
  const gasServiceKvs = await gasService.getAccountWithKvs();
  assertAccount(gasServiceKvs, {
    balance: 100_000_000n,
    allKvs: [
      e.kvs.Mapper('gas_collector').Value(e.Addr(collector.toString()))
    ]
  });

  // There are events emitted for the Gateway contract, but there is no way to test those currently...
});

test.skip('Deploy remote canonical token errors', async () => {
  await user.callContract({
    callee: its,
    funcName: 'deployRemoteCanonicalToken',
    gasLimit: 20_000_000,
    funcArgs: [
      e.Bytes(TOKEN_ID_CANONICAL),
      e.Str(OTHER_CHAIN_NAME)
    ]
  }).assertFail({ code: 4, message: 'Token manager does not exist' });

  // Mock token as not being canonical
  await its.setAccount({
    ...(await its.getAccountWithKvs()),
    kvs: [
      e.kvs.Mapper('gateway').Value(gateway),
      e.kvs.Mapper('gas_service').Value(gasService),
      e.kvs.Mapper('remote_address_validator').Value(interchainTokenFactory),
      e.kvs.Mapper('implementation_mint_burn').Value(tokenManagerMintBurn),
      e.kvs.Mapper('implementation_lock_unlock').Value(tokenManagerLockUnlock),

      e.kvs.Mapper('chain_name_hash').Value(e.Bytes(CHAIN_NAME_HASH)),

      e.kvs.Mapper('token_manager_address', e.Bytes(TOKEN_ID_CANONICAL)).Value(tokenManagerLockUnlock)
    ]
  });

  await user.callContract({
    callee: its,
    funcName: 'deployRemoteCanonicalToken',
    gasLimit: 20_000_000,
    funcArgs: [
      e.Bytes(TOKEN_ID_CANONICAL),
      e.Str(OTHER_CHAIN_NAME)
    ]
  }).assertFail({ code: 4, message: 'Not canonical token manager' });
});
