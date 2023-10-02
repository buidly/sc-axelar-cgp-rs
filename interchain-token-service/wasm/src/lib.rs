// Code generated by the multiversx-sc multi-contract system. DO NOT EDIT.

////////////////////////////////////////////////////
////////////////// AUTO-GENERATED //////////////////
////////////////////////////////////////////////////

// Init:                                 1
// Endpoints:                           15
// Async Callback (empty):               1
// Total number of exported functions:  17

#![no_std]

// Configuration that works with rustc < 1.73.0.
// TODO: Recommended rustc version: 1.73.0 or newer.
#![feature(lang_items)]

multiversx_sc_wasm_adapter::allocator!();
multiversx_sc_wasm_adapter::panic_handler!();

multiversx_sc_wasm_adapter::endpoints! {
    interchain_token_service
    (
        init => init
        registerCanonicalToken => register_canonical_token
        deployRemoteCanonicalToken => deploy_remote_canonical_token
        deployCustomTokenManager => deploy_custom_token_manager
        deployRemoteCustomTokenManager => deploy_remote_custom_token_manager
        deployAndRegisterStandardizedToken => deploy_and_register_standardized_token
        get_canonical_token_id => get_canonical_token_id
        get_custom_token_id => get_custom_token_id
        get_implementation => get_implementation
        get_valid_token_manager_address => get_valid_token_manager_address
        get_token_address => get_token_address
        get_flow_limit => get_flow_limit
        get_flow_out_amount => get_flow_out_amount
        get_flow_in_amount => get_flow_in_amount
        token_manager_address => token_manager_address
        execute => execute
    )
}

multiversx_sc_wasm_adapter::async_callback_empty! {}
