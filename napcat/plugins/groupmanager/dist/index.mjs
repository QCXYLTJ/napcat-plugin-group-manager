import fs from 'node:fs';
import path from 'node:path';
import { gongjilist } from './攻击.js';
const DEFAULT_CONFIG = {
	welcomeEnable: true,
	welcomeTemplate: '欢迎 {nickname}({user_id}) 加入本群！',
	filterKeywords: [],
	filterPunish: 'none',
	groupListMode: 'none',
	groupListIds: '',
	lockedNicknames: {},
	targetedUsers: [],
	ownlist: [],
	creditBalances: {}, // 用户的可禁言天数余额
};
Reflect.defineProperty(Array.prototype, 'remove', {
	value(value) {
		const arr = this;
		const index = arr.indexOf(value);
		if (index !== -1) {
			arr.splice(index, 1);
		}
		return arr;
	},
});
Reflect.defineProperty(Array.prototype, 'randomget', {
	value() {
		const arr = this;
		return arr[Math.floor(Math.random() * arr.length)] || '';
	},
});
const sleep = () => new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 1000) + 4000));
const window = {};
window.gaiming = [];
let currentConfig = { ...DEFAULT_CONFIG };
function loadConfig(ctx) {
	const configFilePath = ctx.configPath;
	if (fs.existsSync(configFilePath)) {
		const raw = fs.readFileSync(configFilePath, 'utf-8');
		const loaded = JSON.parse(raw);
		currentConfig = { ...DEFAULT_CONFIG, ...loaded };
		ctx.logger.info('配置已加载');
	} else {
		saveConfig(ctx, DEFAULT_CONFIG);
	}
}
function saveConfig(ctx, newConfig) {
	const configFilePath = ctx.configPath;
	currentConfig = { ...currentConfig, ...newConfig };
	const dir = path.dirname(configFilePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(configFilePath, JSON.stringify(currentConfig, null, 2), 'utf-8');
	ctx.logger.info('配置已保存');
}
function buildConfigUI(ctx) {
	const { NapCatConfig } = ctx;
	return NapCatConfig.combine(
		NapCatConfig.html('<div style="padding:10px; border-bottom:1px solid #ccc;"><h3>🛡️ 群管插件设置</h3></div>'),
		// --- 黑白名单设置 ---
		NapCatConfig.html('<div style="margin-top:10px;"><b>📋 群组名单控制</b></div>'),
		NapCatConfig.select(
			'groupListMode',
			'名单模式',
			[
				{ label: '不启用 (管理所有群)', value: 'none' },
				{ label: '黑名单 (忽略下列群)', value: 'blacklist' },
				{ label: '白名单 (只管下列群)', value: 'whitelist' },
			],
			DEFAULT_CONFIG.groupListMode,
			'选择插件生效的范围'
		),
		NapCatConfig.text('groupListIds', '群号列表', DEFAULT_CONFIG.groupListIds, '多个群号用英文逗号 , 分隔'),
		// --- 入群欢迎 ---
		NapCatConfig.html('<div style="margin-top:20px;"><b>👋 入群欢迎</b></div>'),
		NapCatConfig.boolean('welcomeEnable', '启用入群欢迎', DEFAULT_CONFIG.welcomeEnable, '是否在新成员入群时发送欢迎语'),
		NapCatConfig.text('welcomeTemplate', '欢迎语模板', DEFAULT_CONFIG.welcomeTemplate, '支持变量: {nickname}, {user_id}')
	);
}

async function callOB11(ctx, action, params) {
	try {
		const result = await ctx.actions.call(action, params, ctx.adapterName, ctx.pluginManager.config);
		return result;
	} catch (error) { }
}
const huancun = new Map();

async function onMessage(ctx, event) {
	//ctx.logger.info(event);
	const groupId = String(event.group_id);
	const msg = event.raw_message?.trim() || '';
	const userId = String(event.user_id);
	const userAdmin = currentConfig.ownlist.includes(userId);
	const ownerinfo = await callOB11(ctx, 'get_login_info', {});
	const ownerqq = String(ownerinfo.user_id);

	//加入缓存
	huancun.set(event.message_id, event.message);
	setTimeout(() => {
		huancun.delete(event.message_id);
	}, 180000);

	//私聊自动攻击
	if (currentConfig.targetedUsers.includes(userId) && event.message_type == 'private') {
		callOB11(ctx, 'send_private_msg', {
			user_id: userId,
			message: ` ${gongjilist.randomget()}`,
		});
	}

	if (event.message_type !== 'group') return;
	const own = await callOB11(ctx, 'get_group_member_info', { group_id: groupId, user_id: ownerqq, no_cache: true });
	const ms = await callOB11(ctx, 'get_group_member_list', { group_id: groupId, no_cache: true });
	const selfguanli = ['owner', 'admin'].includes(own.role);
	const userguanli = ['owner', 'admin'].includes(event.sender.role);
	const atlist = [];
	const textlist = [];
	for (const obj of event.message) {
		if (obj.type === 'at') {
			atlist.push(obj.data.qq);
		}
		if (obj.type === 'text') {
			textlist.push(obj.data.text);
		}
	}
	const textall = textlist.join();

	//自动检测大段文字
	if (textall.length > 99 && selfguanli && !userAdmin && !userguanli) {
		await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: userId, duration: 300 });
		await callOB11(ctx, 'send_group_msg', {
			group_id: groupId,
			message: [
				{ type: 'at', data: { qq: userId } },
				{ type: 'text', data: { text: ` 因为发大段文字而被禁言五分钟` } },
			],
		});
	}

	// 群名片管理
	if (!window.zuduan1 && selfguanli) {
		window.zuduan1 = true;
		const lm = currentConfig.lockedNicknames;
		// 一次性收集待修改成员
		for (const m of ms) {
			// 锁定名片
			if (groupId == '469160606') {
				if (m.card !== '你已被移出群聊   　　　 　　　　  　　　　' && !m.is_robot) {
					await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: m.user_id, card: '你已被移出群聊   　　　 　　　　  　　　　' }); //整乐子修改群名片
					ctx.logger.info(`修改${m.user_id}的群名片${m.card || m.nickname}为【你已被移出群聊   　　　 　　　　  　　　　】`);
					await sleep();
				}
			} else if (lm[m.user_id]) {
				if (m.card !== lm[m.user_id]) {
					await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: m.user_id, card: lm[m.user_id] }); //修改群名片为锁定的名字
					ctx.logger.info(`修改${m.user_id}的群名片${m.card || m.nickname}为【${lm[m.user_id]}】`);
					await sleep();
				}
			}
			// 清除自定义名片
			else if (m.card && m.card !== m.nickname) {
				await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: m.user_id, card: m.nickname }); //清空群名片
				ctx.logger.info(`清除${m.user_id}的群名片${m.card}`);
				await sleep();
			}
		}
		window.zuduan1 = false;
	}

	// 自动跟话
	if (!userAdmin && groupId != '774922031' && Math.random() < 0.1) {
		const textlist = [];
		for (const obj of event.message) {
			if (obj.type === 'text') {
				const array = obj.data.text.split(/[，。, ]/);
				for (const t of array) {
					textlist.push(t);
				}
			}
		}
		const xiaoxi = ` ${textlist.randomget()}🥵🥵🥵`;
		callOB11(ctx, 'send_group_msg', {
			group_id: groupId,
			message: [
				{ type: 'at', data: { qq: userId } },
				{
					type: 'text',
					data: {
						text: xiaoxi,
					},
				},
			],
		});
	}

	// 自动反击
	const fanying = function () {
		if (!userAdmin && currentConfig.ownlist.some((id) => atlist.includes(id)) && ['妈', '爹', '爸', '狗', '逼', '🐎', '🐴', 'nm', '屄'].some((s) => textall.includes(s))) {
			callOB11(ctx, 'send_group_msg', {
				group_id: groupId,
				message: [
					{ type: 'at', data: { qq: userId } },
					{ type: 'text', data: { text: ` ${gongjilist.randomget()}` } },
				],
			});
		}
	};
	fanying();

	//群聊自动攻击
	if (currentConfig.targetedUsers.includes(userId)) {
		callOB11(ctx, 'send_group_msg', {
			group_id: groupId,
			message: [
				{ type: 'at', data: { qq: userId } },
				{ type: 'text', data: { text: ` ${gongjilist.randomget()}` } },
			],
		});
	}

	//违禁词处理
	if (!userAdmin && selfguanli && !userguanli && currentConfig.filterKeywords.some((s) => textall.includes(s))) {
		await callOB11(ctx, 'delete_msg', { message_id: event.message_id });
		await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: userId, duration: 300 });
		await callOB11(ctx, 'send_group_msg', {
			group_id: groupId,
			message: [
				{ type: 'at', data: { qq: userId } },
				{ type: 'text', data: { text: ` 因为发违禁词而被禁言五分钟` } },
			],
		});
	}

	//指令反应
	if (msg.includes('/')) {
		const parts = msg.split('/');
		const cmd = parts[0];
		const params = parts[1];
		const lockName = parts[2];
		const atSeg = event.message.find((s) => s.type === 'at');
		const targetId = atSeg ? String(atSeg.data?.qq) : params;
		if (cmd == '禁言骰子' && selfguanli) {
			setTimeout(async function () {
				loadConfig(ctx);
				const mins = Math.floor(Math.random() * 86400) - 43200; // -30 ~ 30
				const currentBalance = currentConfig.creditBalances[userId] || 0;
				currentConfig.creditBalances[userId] = currentBalance + mins;
				saveConfig(ctx, { creditBalances: currentConfig.creditBalances });
				const yue = currentConfig.creditBalances[userId];
				if (yue < 0) {
					let duration = Math.abs(yue) * 60; // 转秒
					const shutlist = await callOB11(ctx, 'get_group_shut_list', { group_id: groupId, no_cache: true });
					const userinfo = shutlist.find((m) => String(m.uin) == userId);
					if (userinfo) {
						const now = Math.floor(Date.now() / 1000);
						duration = duration + userinfo.shutUpTime - now;
					}
					currentConfig.creditBalances[userId] = 0;
					saveConfig(ctx, { creditBalances: currentConfig.creditBalances });
					callOB11(ctx, 'set_group_ban', {
						group_id: groupId,
						user_id: userId,
						duration: duration,
					});
					callOB11(ctx, 'send_group_msg', {
						group_id: groupId,
						message: [
							{ type: 'at', data: { qq: userId } },
							{ type: 'text', data: { text: ` 原有禁言余额 ${currentBalance} ，骰子点数 ${mins}，当前禁言余额 ${yue} 。因为余额为负数，增加禁言 ${Math.abs(yue)} 分钟 🎲，然后将禁言余额归零。` } },
						],
					});
				} // 负数：禁言目标
				else {
					callOB11(ctx, 'send_group_msg', {
						group_id: groupId,
						message: [
							{ type: 'at', data: { qq: userId } },
							{
								type: 'text',
								data: { text: ` 原有禁言余额 ${currentBalance}，骰子点数 ${mins}，当前禁言余额 ${yue} 🎲` },
							},
						],
					});
				} // 正数：增加用户的禁言天数余额
			}, Math.random() * 1000);
		}
		if (cmd === '禁言' && selfguanli) {
			loadConfig(ctx);
			const mins = Number(lockName);
			let duration = mins * 60;
			if (userguanli) {
				await callOB11(ctx, 'set_group_ban', {
					group_id: groupId,
					user_id: targetId,
					duration: duration,
				});
			} else {
				const balance = currentConfig.creditBalances[userId] || 0;
				if (balance <= 0) {
					await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '❌ 你没有可用的禁言余额。' });
				} else {
					if (isNaN(mins) || mins <= 0) {
						await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '❌ 请提供有效的禁言分钟，例如：禁言/@用户/3' });
					} else if (balance < mins) {
						await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `❌ 你的余额不足（剩余 ${balance} 分钟。` });
					} // 检查余额
					else {
						const shutlist = await callOB11(ctx, 'get_group_shut_list', { group_id: groupId, no_cache: true });
						const userinfo = shutlist.find((m) => String(m.uin) == targetId);
						if (userinfo) {
							const now = Math.floor(Date.now() / 1000);
							duration = duration + userinfo.shutUpTime - now;
						}
						currentConfig.creditBalances[userId] = balance - mins;
						saveConfig(ctx, { creditBalances: currentConfig.creditBalances });
						await callOB11(ctx, 'set_group_ban', {
							group_id: groupId,
							user_id: targetId,
							duration: duration,
						});
						await callOB11(ctx, 'send_group_msg', {
							group_id: groupId,
							message: [
								{ type: 'at', data: { qq: targetId } },
								{ type: 'text', data: { text: ` 已被 ${userId} 禁言 ${mins} 分钟，扣除 ${mins} 分钟余额，剩余余额 ${currentConfig.creditBalances[userId]}` } },
							],
						});
					} // 执行禁言
				}
			}
		}
		// 添加查询余额命令（可选，方便用户查看）
		if (cmd === '禁言余额') {
			loadConfig(ctx);
			const balance = currentConfig.creditBalances[userId] || 0;
			await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `📊 你的禁言余额：${balance} 分钟` });
		}
		if (userAdmin) {
			if (cmd == '违禁词添加' && selfguanli) {
				if (!currentConfig.filterKeywords.includes(params)) {
					currentConfig.filterKeywords.push(params);
					saveConfig(ctx, { filterKeywords: currentConfig.filterKeywords });
				}
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `违禁词添加 ${params}` });
			}
			if (cmd == '违禁词移除' && selfguanli) {
				if (currentConfig.filterKeywords.includes(params)) {
					currentConfig.filterKeywords.remove(params);
					saveConfig(ctx, { filterKeywords: currentConfig.filterKeywords });
				}
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `违禁词移除 ${params}` });
			}
			if (cmd == '违禁词列表' && selfguanli) {
				const list = `违禁词列表：${currentConfig.filterKeywords.join(', ')}`;
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: list });
			}
			//禁言骰子
			if (cmd === '开始攻击') {
				if (!currentConfig.targetedUsers.includes(targetId)) {
					currentConfig.targetedUsers.push(targetId);
					saveConfig(ctx, { targetedUsers: currentConfig.targetedUsers });
					await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已开始攻击 ${targetId}` });
				}
			}
			if (cmd === '终止攻击') {
				if (currentConfig.targetedUsers.includes(targetId)) {
					currentConfig.targetedUsers.remove(targetId);
					saveConfig(ctx, { targetedUsers: currentConfig.targetedUsers });
					await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已终止攻击 ${targetId}` });
				}
			}
			if (cmd === '攻击列表') {
				const list = currentConfig.targetedUsers.length === 0 ? '当前没有被攻击的用户' : `攻击列表：${currentConfig.targetedUsers.join(', ')}`;
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: list });
			}
			if (cmd === '锁定名片') {
				await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: targetId, card: lockName });
				currentConfig.lockedNicknames[targetId] = lockName;
				saveConfig(ctx, { lockedNicknames: currentConfig.lockedNicknames });
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已锁定 ${targetId} 的群名片为: ${lockName}` });
			}
			if (cmd === '解锁名片') {
				if (currentConfig.lockedNicknames[targetId]) {
					delete currentConfig.lockedNicknames[targetId];
					saveConfig(ctx, { lockedNicknames: currentConfig.lockedNicknames });
					await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已解除 ${targetId} 的群名片锁定` });
				}
			}
			if (cmd === '锁定名片列表') {
				const locked = Object.entries(currentConfig.lockedNicknames);
				const listMsg = locked.map(([qq, name]) => `${qq}: ${name}`).join('\n');
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `锁定名片列表:\n${listMsg}` });
			}
			if (cmd === '添加主人') {
				if (!currentConfig.ownlist.includes(targetId)) {
					currentConfig.ownlist.push(targetId);
					saveConfig(ctx, { ownlist: currentConfig.ownlist });
					await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已添加 ${targetId} 为主人` });
				}
			}
			if (cmd === '移除主人') {
				if (currentConfig.ownlist.includes(targetId)) {
					currentConfig.ownlist.remove(targetId);
					saveConfig(ctx, { ownlist: currentConfig.ownlist });
					await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已移除 ${targetId} 的主人权限` });
				}
			}
			if (cmd === '主人列表') {
				const list = currentConfig.ownlist.length === 0 ? '当前没有主人' : `主人列表：${currentConfig.ownlist.join(', ')}`;
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: list });
			}
		}
	}
}
async function onEvent(ctx, event) {
	//ctx.logger.info(event);
	if (event.notice_type == 'group_recall' && !currentConfig.ownlist.includes(String(event.operator_id))) {
		const message = huancun.get(event.message_id);
		if (Array.isArray(message)) {
			message.unshift({
				type: 'text',
				data: {
					text: ` 撤回了【`,
				},
			});
			message.unshift({ type: 'at', data: { qq: String(event.user_id) } });
			message.push({
				type: 'text',
				data: {
					text: `】`,
				},
			});
			await callOB11(ctx, 'send_group_msg', {
				group_id: String(event.group_id),
				message: message,
			});
		}
	}
}

let plugin_config_ui = [];
async function plugin_init(ctx) {
	ctx.logger.info('正在加载 Group Manager...');
	loadConfig(ctx);
	plugin_config_ui = buildConfigUI(ctx);
	ctx.logger.info('Group Manager 加载完成!');
}
async function plugin_get_config(ctx) {
	return currentConfig;
}
function plugin_on_config_change(ctx, _, key, value) {
	saveConfig(ctx, { [key]: value });
}
const plugin_onmessage = onMessage;
const plugin_onevent = onEvent;

export { plugin_config_ui, plugin_get_config, plugin_init, plugin_on_config_change, plugin_onevent, plugin_onmessage };
