// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// liquidity share token
contract AMMToken is ERC20, Ownable {
    constructor() ERC20("AMM Token", "AMM") Ownable(msg.sender) {}
}
