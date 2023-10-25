import { afterEach, assert, beforeEach, test } from "vitest";
import { assertAccount } from "xsuite";
import { SWorld, SContract, SWallet } from "xsuite";
import { e } from "xsuite";
import createKeccakHash from "keccak";
import { ALICE_ADDR, BOB_ADDR, generateSignature, getOperatorsHash } from '../helpers';

let world: SWorld;
let deployer: SWallet;
let contract: SContract;
let address: string;

beforeEach(async () => {
  world = await SWorld.start();
  world.setCurrentBlockInfo({
    nonce: 0,
    epoch: 0,
  })

  deployer = await world.createWallet({
    balance: 10_000_000_000n,
  });
});

afterEach(async () => {
  await world.terminate();
});

const deployContract = async () => {
  ({ contract, address } = await deployer.deployContract({
    code: "file:auth/output/auth.wasm",
    codeMetadata: ["upgradeable"],
    gasLimit: 100_000_000,
    codeArgs: []
  }));

  const pairs = await contract.getAccountWithKvs();
  assertAccount(pairs, {
    balance: 0n,
    allKvs: [],
  });
}

test("Validate proof no epoch", async () => {
  await deployContract();

  const hash = createKeccakHash('keccak256').update('hash').digest('hex');
  const signature = generateSignature(hash);
  const data = e.Tuple(
    e.List(e.Addr(ALICE_ADDR)),
    e.List(e.U(10)),
    e.U(10),
    e.List(e.Bytes(signature))
  );

  await deployer.callContract({
    callee: contract,
    gasLimit: 10_000_000,
    funcName: "validateProof",
    funcArgs: [
      e.Bytes(hash),
      data,
    ],
  }).assertFail({ code: 4, message: 'Invalid operators' });
});

test("Validate proof old epoch", async () => {
  await deployContract();

  const operatorsHash = getOperatorsHash([ALICE_ADDR], [10], 10);
  await contract.setAccount({
    ...await contract.getAccount(),
    kvs: [
      // Manually add epoch for hash & current epoch
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(17)),
    ]
  });

  const hash = createKeccakHash('keccak256').update('hash').digest('hex');
  const signature = generateSignature(hash);
  const data = e.Tuple(
    e.List(e.Addr(ALICE_ADDR)),
    e.List(e.U(10)),
    e.U(10),
    e.List(e.Bytes(signature))
  );

  await deployer.callContract({
    callee: contract,
    gasLimit: 10_000_000,
    funcName: "validateProof",
    funcArgs: [
      e.Bytes(hash),
      data,
    ],
  }).assertFail({ code: 4, message: 'Invalid operators' });

  let pairs = await contract.getAccountWithKvs();
  assertAccount(pairs, {
    balance: 0,
    allKvs: [
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(17)),
    ],
  });
});


test("Validate proof wrong operators weight", async () => {
  await deployContract();

  const operatorsHash = getOperatorsHash([ALICE_ADDR], [10], 10);
  await contract.setAccount({
    ...await contract.getAccount(),
    kvs: [
      // Manually add epoch for hash & current epoch
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ]
  });

  const hash = createKeccakHash('keccak256').update('hash').digest('hex');
  const wrongHash = createKeccakHash('keccak256').update('wrongHash').digest('hex');
  const signature = generateSignature(wrongHash);
  const data = e.Tuple(
    e.List(e.Addr(ALICE_ADDR)),
    e.List(e.U(9)), // Wrong weight here
    e.U(10),
    e.List(e.Bytes(signature))
  );

  await deployer.callContract({
    callee: contract,
    gasLimit: 10_000_000,
    funcName: "validateProof",
    funcArgs: [
      e.Bytes(hash),
      data,
    ],
  }).assertFail({ code: 4, message: 'Invalid operators' });

  let pairs = await contract.getAccountWithKvs();
  assertAccount(pairs, {
    balance: 0,
    allKvs: [
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ],
  });
});

test("Validate proof invalid signature", async () => {
  await deployContract();

  const operatorsHash = getOperatorsHash([ALICE_ADDR], [10], 10);
  await contract.setAccount({
    ...await contract.getAccount(),
    kvs: [
      // Manually add epoch for hash & current epoch
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ]
  });

  const hash = createKeccakHash('keccak256').update('hash').digest('hex');
  const wrongHash = createKeccakHash('keccak256').update('wrongHash').digest('hex');
  const signature = generateSignature(wrongHash);
  const data = e.Tuple(
    e.List(e.Addr(ALICE_ADDR)),
    e.List(e.U(10)),
    e.U(10),
    e.List(e.Bytes(signature))
  );

  await deployer.callContract({
    callee: contract,
    gasLimit: 10_000_000,
    funcName: "validateProof",
    funcArgs: [
      e.Bytes(hash),
      data,
    ],
  }).assertFail({ code: 10, message: 'invalid signature' });

  let pairs = await contract.getAccountWithKvs();
  assertAccount(pairs, {
    balance: 0,
    allKvs: [
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ],
  });
});

test("Validate proof operators repeat", async () => {
  await deployContract();

  const operatorsHash = getOperatorsHash([ALICE_ADDR, ALICE_ADDR], [10, 10], 20);
  await contract.setAccount({
    ...await contract.getAccount(),
    kvs: [
      // Manually add epoch for hash & current epoch
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ]
  });

  const hash = createKeccakHash('keccak256').update('hash').digest('hex');
  const signature = generateSignature(hash);
  const data = e.Tuple(
    e.List(e.Addr(ALICE_ADDR), e.Addr(ALICE_ADDR)),
    e.List(e.U(10), e.U(10)),
    e.U(20),
    e.List(e.Bytes(signature), e.Bytes(signature))
  );

  await deployer.callContract({
    callee: contract,
    gasLimit: 10_000_000,
    funcName: "validateProof",
    funcArgs: [
      e.Bytes(hash),
      data,
    ],
  }).assertFail({ code: 4, message: 'Malformed signers' });

  let pairs = await contract.getAccountWithKvs();
  assertAccount(pairs, {
    balance: 0,
    allKvs: [
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ],
  });
});

test("Validate proof low signatures weight", async () => {
  await deployContract();

  const operatorsHash = getOperatorsHash([ALICE_ADDR], [9], 10);
  await contract.setAccount({
    ...await contract.getAccount(),
    kvs: [
      // Manually add epoch for hash & current epoch
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ]
  });

  const hash = createKeccakHash('keccak256').update('hash').digest('hex');
  const signature = generateSignature(hash);
  const data = e.Tuple(
    e.List(e.Addr(ALICE_ADDR)),
    e.List(e.U(9)),
    e.U(10),
    e.List(e.Bytes(signature))
  );

  await deployer.callContract({
    callee: contract,
    gasLimit: 10_000_000,
    funcName: "validateProof",
    funcArgs: [
      e.Bytes(hash),
      data,
    ],
  }).assertFail({ code: 4, message: 'Low signatures weight' });

  let pairs = await contract.getAccountWithKvs();
  assertAccount(pairs, {
    balance: 0,
    allKvs: [
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ],
  });
});

test("Validate proof only first operator checked", async () => {
  await deployContract();

  const operatorsHash = getOperatorsHash([ALICE_ADDR, BOB_ADDR], [10, 10], 10);
  await contract.setAccount({
    ...await contract.getAccount(),
    kvs: [
      // Manually add epoch for hash & current epoch
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(1)),
    ]
  });

  const hash = createKeccakHash('keccak256').update('hash').digest('hex');
  const signature = generateSignature(hash);
  const data = e.Tuple(
    e.List(e.Addr(ALICE_ADDR), e.Addr(BOB_ADDR)),
    e.List(e.U(10), e.U(10)),
    e.U(10),
    e.List(e.Bytes(signature), e.Bytes(signature)) // wrong signature for bob will not be checked
  );

  const result = await deployer.callContract({
    callee: contract,
    gasLimit: 10_000_000,
    funcName: "validateProof",
    funcArgs: [
      e.Bytes(hash),
      data,
    ],
  });
  assert(result.returnData[0] === '01');

  let pairs = await contract.getAccountWithKvs();
  assertAccount(pairs, {
    balance: 0,
    allKvs: [
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(1)),
    ],
  });
});


test("Validate proof", async () => {
  await deployContract();

  const operatorsHash = getOperatorsHash([ALICE_ADDR, BOB_ADDR], [10, 10], 20);
  await contract.setAccount({
    ...await contract.getAccount(),
    kvs: [
      // Manually add epoch for hash & current epoch
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ]
  });

  const hash = createKeccakHash('keccak256').update('hash').digest('hex');
  const signature = generateSignature(hash);
  const signatureBob = generateSignature(hash, './bob.pem');
  const data = e.Tuple(
    e.List(e.Addr(ALICE_ADDR), e.Addr(BOB_ADDR)),
    e.List(e.U(10), e.U(10)),
    e.U(20),
    e.List(e.Bytes(signature), e.Bytes(signatureBob))
  );

  const result = await deployer.callContract({
    callee: contract,
    gasLimit: 10_000_000,
    funcName: "validateProof",
    funcArgs: [
      e.Bytes(hash),
      data,
    ],
  });
  assert(result.returnData[0] === '');

  let pairs = await contract.getAccountWithKvs();
  assertAccount(pairs, {
    balance: 0,
    allKvs: [
      e.kvs.Mapper("epoch_for_hash", e.Bytes(operatorsHash)).Value(e.U64(1)),

      e.kvs.Mapper("current_epoch").Value(e.U64(16)),
    ],
  });
});
