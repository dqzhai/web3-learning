/*
 * test.js
 * Copyright 2026 Qunhe Tech, all rights reserved.
 * Qunhe PROPRIETARY/CONFIDENTIAL, any form of usage is subject to approval.
 */

// 纯Node.js环境下的permit调用脚本

// 第一步：ES模块语法导入dotenv（必须在最开头）
import dotenv from 'dotenv';
// const { ethers } = require('ethers');
import {ethers} from 'ethers';
//require('dotenv').config();
// 第二步：加载.env文件，和require('dotenv').config()作用完全一致
dotenv.config();


async function main() {
    console.log("开始执行permit脚本...");

    // 使用私钥连接到Sepolia测试网
    const PRIVATE_KEY = process.env.PRIVATEKEY;
    console.log(`PRIVATE_KEY: ${PRIVATE_KEY}`);

    // 检查私钥是否正确配置
    if (!PRIVATE_KEY) {
        throw new Error("未配置私钥！请在.env文件中设置PRIVATEKEY环境变量");
    }

    // 确保私钥格式正确
    let formattedPrivateKey = PRIVATE_KEY;
    if (!formattedPrivateKey.startsWith('0x')) {
        formattedPrivateKey = '0x' + formattedPrivateKey;
    }

    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
    const wallet = new ethers.Wallet(formattedPrivateKey, provider);
    const userAddress = wallet.address;

    console.log(`使用地址: ${userAddress}`);
    console.log(`当前网络: Sepolia (chainId: ${(await provider.getNetwork()).chainId})`);

    // 合约地址（已在原始脚本中提供）
    const tokenAddress = '0x0a54557dD21566862F683F083253ec7d5688897D'; // MyToken 合约地址

    // PermitTransfer合约地址，请替换为实际部署地址
    const permitTransferAddress = '0x41856383f0c518e79d95231a29F127be5B2Dd5D4'; // 需要替换为实际部署的地址
    console.log(`PermitTransfer 合约地址: ${permitTransferAddress}`);

    // 设置一个测试用的 spender 地址 - 现在是PermitTransfer合约地址
    const spenderAddress = permitTransferAddress;
    console.log(`Spender 地址: ${spenderAddress}`);

    // 设置接收者地址（转账目标）
    const receiverAddress = "0x19a3a92FB7020a40Bc6De1811761a86c45FEBf9c"; // 可以替换为任意地址
    console.log(`接收者地址: ${receiverAddress}`);

    const amount = ethers.parseUnits("100", 18); // 授权 100 MTK

    // 初始化Token合约实例
    const tokenABI = [
        // 注意：OpenZeppelin的ERC20Permit.permit函数参数顺序
        "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
        "function nonces(address owner) external view returns (uint256)",
        "function name() external view returns (string)",
        "function version() external view returns (string)",
        "function DOMAIN_SEPARATOR() external view returns (bytes32)",
        "function balanceOf(address account) external view returns (uint256)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function transferFrom(address from, address to, uint256 amount) external returns (bool)"
    ];
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);

    // 初始化PermitTransfer合约实例
    const permitTransferABI = [
        "function receiveTokens(address token, address from, address to, uint256 amount) external"
    ];
    const permitTransferContract = new ethers.Contract(permitTransferAddress, permitTransferABI, wallet);

    try {
        // 获取当前 Nonce 和过期时间
        const nonce = await tokenContract.nonces(userAddress);
        console.log(`当前 nonce: ${nonce}`);

        const deadline = Math.floor(Date.now() / 1000) + 3600; // 签名1小时后过期
        console.log(`过期时间: ${new Date(deadline * 1000).toLocaleString()}`);

        // 构建 EIP-712 Domain 和 Types
        const chainId = (await provider.getNetwork()).chainId;

        // 获取合约名称和版本
        const name = await tokenContract.name();
        let version = "1";
        try {
            version = await tokenContract.version();
        } catch (error) {
            console.log("合约没有实现version()函数，使用默认版本'1'");
        }

        console.log(`合约名称: ${name}, 版本: ${version}`);

        // 尝试获取合约的DOMAIN_SEPARATOR进行验证
        try {
            const domainSeparator = await tokenContract.DOMAIN_SEPARATOR();
            console.log(`合约DOMAIN_SEPARATOR: ${domainSeparator}`);
        } catch (error) {
            console.log("无法获取合约的DOMAIN_SEPARATOR");
        }

        const domain = {
            name: name, // 使用合约实际名称
            version: version,
            chainId: chainId,
            verifyingContract: tokenAddress
        };

        // 修正EIP-712类型定义，使其与OpenZeppelin的ERC20Permit实现一致
        const types = {
            Permit: [
                {name: "owner", type: "address"},
                {name: "spender", type: "address"},
                {name: "value", type: "uint256"},
                {name: "nonce", type: "uint256"},
                {name: "deadline", type: "uint256"}
            ]
        };

        const message = {
            owner: userAddress,
            spender: spenderAddress,
            value: amount,
            nonce: nonce,
            deadline: deadline
        };

        // 打印完整的签名数据，便于调试
        // 确保BigInt值被转换为字符串
        const messageForLog = {
            owner: message.owner,
            spender: message.spender,
            value: message.value.toString(),
            nonce: message.nonce.toString(),
            deadline: message.deadline
        };

        console.log("签名数据:", {
            domain,
            types,
            message: messageForLog
        });

        console.log("请求签名中...");
        // 请求签名
        const signature = await wallet.signTypedData(domain, types, message);
        console.log(`签名完成: ${signature}`);

        // 拆分签名 (v, r, s)
        const sig = ethers.Signature.from(signature);
        console.log(`签名参数: v=${sig.v}, r=${sig.r}, s=${sig.s}`);

        // 检查当前授权额度
        const initialAllowance = await tokenContract.allowance(userAddress, spenderAddress);
        console.log(`初始授权额度: ${ethers.formatUnits(initialAllowance, 18)} MTK`);

        // 检查发送者余额
        const senderBalance = await tokenContract.balanceOf(userAddress);
        console.log(`发送者余额: ${ethers.formatUnits(senderBalance, 18)} MTK`);

        // 检查接收者初始余额
        const initialReceiverBalance = await tokenContract.balanceOf(receiverAddress);
        console.log(`接收者初始余额: ${ethers.formatUnits(initialReceiverBalance, 18)} MTK`);

        // 提交 permit 交易
        console.log("提交 permit 交易...");
        console.log("交易参数:", {
            owner: userAddress,
            spender: spenderAddress,
            value: amount.toString(),
            deadline: deadline,
            v: sig.v,
            r: sig.r,
            s: sig.s
        });

        // 使用gas限制和gasPrice以确保交易能够被确认
        const gasLimit = await tokenContract.permit.estimateGas(
            userAddress,
            spenderAddress,
            amount,
            deadline,
            sig.v,
            sig.r,
            sig.s
        ).catch(e => {
            console.log("Gas估算失败，使用默认值:", e.message);
            return 300000n; // 默认gas限制，使用BigInt
        });

        console.log(`估算的gas限制: ${gasLimit.toString()}`);

        // 计算增加20%的gas限制，确保使用BigInt运算
        const gasLimitWithBuffer = gasLimit * 120n / 100n; // 增加20%的gas限制

        const permitTx = await tokenContract.permit(
            userAddress,
            spenderAddress,
            amount,
            deadline,
            sig.v,
            sig.r,
            sig.s,
            {
                gasLimit: gasLimitWithBuffer // 使用BigInt类型的gas限制
            }
        );

        console.log(`交易已发送，等待确认: ${permitTx.hash}`);
        await permitTx.wait();
        console.log("permit 交易已确认！");

        // 验证授权是否成功
        const newAllowance = await tokenContract.allowance(userAddress, spenderAddress);
        console.log(`新授权额度: ${ethers.formatUnits(newAllowance, 18)} MTK`);

        // 将BigInt转换为字符串进行比较
        const newAllowanceStr = newAllowance.toString();
        const amountStr = amount.toString();

        console.log(`比较: 新授权额度(${newAllowanceStr}) vs 请求授权额度(${amountStr})`);

        // 使用BigInt比较
        if (newAllowance >= amount) {
            console.log("授权成功！现在可以调用 transferFrom 了。");

            // 第二部分：调用PermitTransfer合约的receiveTokens函数
            console.log("\n===== 测试 transferFrom 功能 =====");
            console.log("调用PermitTransfer合约的receiveTokens函数...");

            // 设置gas限制
            const transferGasLimit = 300000n;

            // 调用PermitTransfer合约的receiveTokens函数
            console.log("交易参数:", {
                token: tokenAddress,
                from: userAddress,
                to: receiverAddress,
                amount: amount.toString()
            });

            const transferTx = await permitTransferContract.receiveTokens(
                tokenAddress,
                userAddress,
                receiverAddress,
                amount,
                {
                    gasLimit: transferGasLimit
                }
            );

            console.log(`交易已发送，等待确认: ${transferTx.hash}`);
            await transferTx.wait();
            console.log("transferFrom 交易已确认！");

            // 验证转账是否成功
            const finalReceiverBalance = await tokenContract.balanceOf(receiverAddress);
            console.log(`接收者最终余额: ${ethers.formatUnits(finalReceiverBalance, 18)} MTK`);

            // 计算转账金额
            const transferredAmount = finalReceiverBalance - initialReceiverBalance;
            console.log(`转账金额: ${ethers.formatUnits(transferredAmount, 18)} MTK`);

            if (transferredAmount >= amount) {
                console.log("转账成功！验证完成。");
            } else {
                console.log("转账金额不符，请检查合约和参数。");
            }

            // 检查剩余授权额度
            const remainingAllowance = await tokenContract.allowance(userAddress, spenderAddress);
            console.log(`剩余授权额度: ${ethers.formatUnits(remainingAllowance, 18)} MTK`);

        } else {
            console.log("授权似乎没有生效，请检查合约和参数。");
        }

    } catch (error) {
        console.error("执行过程中出错:");

        // 提供更详细的错误信息
        if (error.code) {
            console.error(`错误代码: ${error.code}`);
        }

        if (error.reason) {
            console.error(`错误原因: ${error.reason}`);
        }

        if (error.error && error.error.message) {
            console.error(`内部错误: ${error.error.message}`);
        }

        if (error.transaction) {
            console.error(`交易信息: ${JSON.stringify({
                from: error.transaction.from,
                to: error.transaction.to,
                data: error.transaction.data.substring(0, 66) + '...' // 只显示部分数据
            }, null, 2)}`);
        }

        // 针对常见错误提供建议
        if (error.message.includes("insufficient funds")) {
            console.error("建议: 请确保账户中有足够的ETH支付gas费用");
        } else if (error.message.includes("nonce")) {
            console.error("建议: nonce错误，可能是由于交易冲突或账户状态不一致");
        } else if (error.message.includes("gas")) {
            console.error("建议: gas相关错误，可能需要调整gas限制或价格");
        } else if (error.message.includes("execution reverted")) {
            console.error("建议: 合约执行被回滚，可能是参数错误或权限不足");
        }

        console.error("完整错误信息:", error);
    }
}

// 执行脚本
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });