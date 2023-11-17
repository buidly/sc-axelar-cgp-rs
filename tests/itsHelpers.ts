import { assertAccount, e, SContract, SWallet } from 'xsuite';
import {
  CHAIN_ID,
  CHAIN_NAME,
  CHAIN_NAME_HASH,
  MOCK_CONTRACT_ADDRESS_1, OTHER_CHAIN_ADDRESS,
  OTHER_CHAIN_NAME,
  TOKEN_ID,
  TOKEN_ID2, TOKEN_ID_CANONICAL
} from './helpers';
import createKeccakHash from "keccak";
import { Buffer } from 'buffer';

let address: string;
export let gateway: SContract;
export let gasService: SContract;
export let remoteAddressValidator: SContract;
export let tokenManagerMintBurn: SContract;
export let tokenManagerLockUnlock: SContract;
export let its: SContract;
export let pingPong: SContract;

export const deployGatewayContract = async (deployer: SWallet) => {
  ({ contract: gateway, address } = await deployer.deployContract({
    code: "file:gateway/output/gateway.wasm",
    codeMetadata: ["upgradeable"],
    gasLimit: 100_000_000,
    codeArgs: [
      e.Addr(MOCK_CONTRACT_ADDRESS_1),
      e.Str(CHAIN_ID),
    ]
  }));

  const kvs = await gateway.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 0n,
    allKvs: [
      e.kvs.Mapper("auth_module").Value(e.Addr(MOCK_CONTRACT_ADDRESS_1)),
      e.kvs.Mapper('chain_id').Value(e.Str(CHAIN_ID))
    ],
  });
}

export const deployGasService = async (deployer: SWallet, collector: SWallet) => {
  ({ contract: gasService, address } = await deployer.deployContract({
    code: "file:gas-service/output/gas-service.wasm",
    codeMetadata: ["upgradeable"],
    gasLimit: 100_000_000,
    codeArgs: [
      e.Addr(collector.toString()),
    ]
  }));

  const kvs = await gasService.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 0n,
    allKvs: [
      e.kvs.Mapper('gas_collector').Value(e.Addr(collector.toString())),
    ],
  });
}

export const deployRemoteAddressValidator = async (deployer: SWallet) => {
  ({ contract: remoteAddressValidator, address } = await deployer.deployContract({
    code: "file:remote-address-validator/output/remote-address-validator.wasm",
    codeMetadata: ["upgradeable"],
    gasLimit: 100_000_000,
    codeArgs: [
      e.Str(CHAIN_NAME),

      e.U32(1),
      e.Str(OTHER_CHAIN_NAME),

      e.U32(1),
      e.Str(OTHER_CHAIN_ADDRESS)
    ]
  }));

  const otherChainAddressHash = createKeccakHash('keccak256').update(OTHER_CHAIN_ADDRESS.toLowerCase()).digest('hex');

  const kvs = await remoteAddressValidator.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 0n,
    allKvs: [
      e.kvs.Mapper('chain_name').Value(e.Str(CHAIN_NAME)),

      e.kvs.Mapper('remote_address_hashes', e.Str(OTHER_CHAIN_NAME)).Value(e.Bytes(otherChainAddressHash)),
      e.kvs.Mapper('remote_addresses', e.Str(OTHER_CHAIN_NAME)).Value(e.Str(OTHER_CHAIN_ADDRESS)),
    ],
  });
}

export const deployTokenManagerMintBurn = async (deployer: SWallet, operator: SWallet | SContract = deployer, its: SWallet | SContract = operator, token: string | null = null, burnRole: boolean = true) => {
  const tokenId = computeStandardizedTokenId(token || TOKEN_ID);

  ({ contract: tokenManagerMintBurn, address } = await deployer.deployContract({
    code: "file:token-manager-mint-burn/output/token-manager-mint-burn.wasm",
    codeMetadata: ["upgradeable"],
    gasLimit: 100_000_000,
    codeArgs: [
      its,
      e.Bytes(tokenId),
      operator,
      e.Option(token ? e.Str(token) : null),
    ]
  }));

  const kvs = await tokenManagerMintBurn.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 0n,
    allKvs: [
      e.kvs.Mapper('interchain_token_service').Value(its),
      e.kvs.Mapper('token_id').Value(e.Bytes(tokenId)),
      e.kvs.Mapper('operator').Value(operator),

      ...(token ? [e.kvs.Mapper('token_identifier').Value(e.Str(token))] : []),
    ],
  });

  // Set mint/burn roles if token is set
  if (token && burnRole) {
    await tokenManagerMintBurn.setAccount({
      ...(await tokenManagerMintBurn.getAccount()),
      balance: 0n,
      kvs: [
        e.kvs.Mapper('interchain_token_service').Value(its),
        e.kvs.Mapper('token_id').Value(e.Bytes(tokenId)),
        e.kvs.Mapper('operator').Value(operator),
        e.kvs.Mapper('token_identifier').Value(e.Str(token)),

        e.kvs.Esdts([{ id: token, roles: ['ESDTRoleLocalBurn', 'ESDTRoleLocalMint' ]}]),
      ],
    });
  }
}

export const deployTokenManagerLockUnlock = async (deployer: SWallet, token = 'MOCK', its: SWallet | SContract = deployer, operator: SWallet = deployer) => {
  const tokenId = computeStandardizedTokenId(token);

  ({ contract: tokenManagerLockUnlock, address } = await deployer.deployContract({
    code: "file:token-manager-lock-unlock/output/token-manager-lock-unlock.wasm",
    codeMetadata: ["upgradeable"],
    gasLimit: 100_000_000,
    codeArgs: [
      its,
      e.Bytes(tokenId),
      operator,
      e.Option(e.Str(token)),
    ]
  }));

  const kvs = await tokenManagerLockUnlock.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 0n,
    allKvs: [
      e.kvs.Mapper('interchain_token_service').Value(its),
      e.kvs.Mapper('token_id').Value(e.Bytes(tokenId)),
      e.kvs.Mapper('operator').Value(operator),
      e.kvs.Mapper('token_identifier').Value(e.Str(token)),
    ],
  });
}

export const deployIts = async (deployer: SWallet) => {
  ({ contract: its, address } = await deployer.deployContract({
    code: "file:interchain-token-service/output/interchain-token-service.wasm",
    codeMetadata: ["upgradeable"],
    gasLimit: 100_000_000,
    codeArgs: [
      gateway,
      gasService,
      remoteAddressValidator,
      tokenManagerMintBurn,
      tokenManagerLockUnlock,
    ]
  }));

  const kvs = await its.getAccountWithKvs();
  assertAccount(kvs, {
    balance: 0n,
    allKvs: [
      e.kvs.Mapper('gateway').Value(gateway),
      e.kvs.Mapper('gas_service').Value(gasService),
      e.kvs.Mapper('remote_address_validator').Value(remoteAddressValidator),
      e.kvs.Mapper('implementation_mint_burn').Value(tokenManagerMintBurn),
      e.kvs.Mapper('implementation_lock_unlock').Value(tokenManagerLockUnlock),

      e.kvs.Mapper('chain_name_hash').Value(e.Bytes(CHAIN_NAME_HASH)),
    ],
  });
}

export const deployPingPongInterchain = async (deployer: SWallet, amount = 1_000) => {
  ({ contract: pingPong } = await deployer.deployContract({
    code: "file:ping-pong-interchain/output/ping-ping-interchain.wasm",
    codeMetadata: ["upgradeable"],
    gasLimit: 100_000_000,
    codeArgs: [
      its,
      e.U(amount),
      e.U64(10),
      e.Option(null),
    ]
  }));
}

export const deployContracts = async (deployer: SWallet, collector: SWallet) => {
  await deployGatewayContract(deployer);
  await deployGasService(deployer, collector);
  await deployRemoteAddressValidator(deployer);
  await deployTokenManagerMintBurn(deployer);
  await deployTokenManagerLockUnlock(deployer);
  await deployIts(deployer);
};

export const computeStandardizedTokenId = (token = TOKEN_ID) => {
  const prefixStandardized = createKeccakHash('keccak256').update('its-standardized-token-id').digest('hex');
  const buffer = Buffer.concat([
    Buffer.from(prefixStandardized, 'hex'),
    Buffer.from(CHAIN_NAME_HASH, 'hex'),
    Buffer.from(token),
  ]);

  return createKeccakHash('keccak256').update(buffer).digest('hex');
}

export const computeCustomTokenId = (user: SWallet, token = TOKEN_ID2) => {
  const prefixCustom = createKeccakHash('keccak256').update('its-custom-token-id').digest('hex');
  const buffer = Buffer.concat([
    Buffer.from(prefixCustom, 'hex'),
    Buffer.from(user.toTopHex(), 'hex'),
    Buffer.from(token),
  ]);

  return createKeccakHash('keccak256').update(buffer).digest('hex');
}
