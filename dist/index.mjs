import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CONFIG = {
	welcomeEnable: true,
	welcomeTemplate: '欢迎 {nickname}({user_id}) 加入本群！',
	filterEnable: false,
	filterKeywords: '加群|兼职|博彩',
	filterPunish: 'none',
	groupListMode: 'none',
	groupListIds: '',
	lockedNicknames: {},
	targetedUsers: [],
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
	try {
		if (fs.existsSync(configFilePath)) {
			const raw = fs.readFileSync(configFilePath, 'utf-8');
			const loaded = JSON.parse(raw);
			currentConfig = { ...DEFAULT_CONFIG, ...loaded };
			ctx.logger.info('配置已加载');
		} else {
			saveConfig(ctx, DEFAULT_CONFIG);
		}
	} catch (e) {
		ctx.logger.error('加载配置失败', e);
	}
}
function saveConfig(ctx, newConfig) {
	const configFilePath = ctx.configPath;
	try {
		currentConfig = { ...currentConfig, ...newConfig };
		const dir = path.dirname(configFilePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(configFilePath, JSON.stringify(currentConfig, null, 2), 'utf-8');
		ctx.logger.info('配置已保存');
	} catch (e) {
		ctx.logger.error('保存配置失败', e);
	}
}
function buildConfigUI(ctx) {
	const { NapCatConfig } = ctx;
	return NapCatConfig.combine(
		NapCatConfig.html('<div style="padding:10px; border-bottom:1px solid #ccc;"><h3>🛡️ 群管插件设置</h3></div>'),
		// --- 主人设置 ---
		NapCatConfig.html('<div style="margin-top:10px;"><b>👑 主人设置</b></div>'),
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
		NapCatConfig.text('welcomeTemplate', '欢迎语模板', DEFAULT_CONFIG.welcomeTemplate, '支持变量: {nickname}, {user_id}'),
		// --- 违禁词 ---
		NapCatConfig.html('<div style="margin-top:20px;"><b>🚫 违禁词过滤</b></div>'),
		NapCatConfig.boolean('filterEnable', '启用关键词过滤', DEFAULT_CONFIG.filterEnable, '检测到关键词自动撤回'),
		NapCatConfig.text('filterKeywords', '违禁词列表', DEFAULT_CONFIG.filterKeywords, '使用 | 分隔多个词'),
		NapCatConfig.select(
			'filterPunish',
			'触发惩罚',
			[
				{ label: '仅撤回', value: 'none' },
				{ label: '撤回并禁言1分钟', value: 'ban' },
				{ label: '撤回并踢出', value: 'kick' },
			],
			DEFAULT_CONFIG.filterPunish,
			'触发违禁词后的额外操作'
		)
	);
}

function decodeHtml(str) {
	if (!str) return str;
	return str
		.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}
async function callOB11(ctx, action, params) {
	try {
		const result = await ctx.actions.call(action, params, ctx.adapterName, ctx.pluginManager.config);
		return result;
	} catch (e) {
		if (typeof e === 'object' && e.message && e.message.includes('No data returned')) {
			return { status: 'ok', retcode: 0, data: null };
		}
		ctx.logger.error(`[OB11] Call ${action} failed:`, e);
		throw e;
	}
}
const huancun = new Map();

async function onMessage(ctx, event) {
	const ownlist = ['1476811518', '2528598753', '1570245877', '1622350454', '2791034087', '1598260859', '1666863327', '3295523405'];
	const groupId = String(event.group_id);
	const msg = event.raw_message?.trim() || '';
	const userId = String(event.user_id);
	const isAdmin = ownlist.includes(userId);
	const array = [
		'恭喜你烂货婊子妈被丢给野犬做肉便器轮奸致死30周年并喜提精厕金奖，姑且算作如偿所愿殉职了。',
		'你狗母尸块被老子贱卖到非洲，给黑鬼做飞机杯精壶。',
		'老子算你婊子妈黄泉路上的碎尸人。',
		'你那死期将至的亲妈，打小就靠掰开她那口烂到流脓的大臭肛，往你个连瘫带瘸的低能儿的屄嘴里灌吃喝。',
		'也难怪让你长成现在这么个驴脸猪脑狗腿子的傻屄粪蛆样儿。',
		'你这野狗东西，天天只能靠吃人们的排泄物续你狗命。',
		'连鸡巴都长歪了，肏你老婆都费劲。',
		'你亲爹妈生出来你这么个脑瘫畸形儿，也配老死还火化？',
		'趁早捎上你狗爹妈，滚去屠宰场报到吧。',
		'欠宰的猪头肉，搁那儿装死装你妈屄上瘾了是吧。',
		'你野爹我直接就是一个回首掏，给你亲妈那条母狗的黑紫烂穴搅的狂喷淫水。',
		'带着那个婊子的骚尿，一股脑灌进你这屄养的杂种狗嘴里。',
		'然后直接又是一脚，给你那下贱的鸭子亲爹的两个狗篮子踢爆。',
		'再给你死爹那根包皮粘连系带的猪屌一把撕烂，露出里面长满垢的发炎龟头。',
		'扯下来两根阴毛，塞你亲猪爹的马眼里，直直扎穿前列腺。',
		'最后把这根让你野爹玩成一滩肉泥的烂鸡巴，裹上你亲猪爹临死前的那最后一发稀汤精液，狠狠地塞进你这屄养的杂种狗嘴里。',
		'让你那死妈的白带和着你那死爹的精斑，一块儿在你这屄养的杂种狗嘴里狠狠中出生根发芽。',
		'你那淫娃老妈子当年生完你去做母猪产后护理的时候，咋就忘了教你这猪屄。',
		'到了年根儿底下，会有杀年猪的来取你狗命。',
		'你个屄养的死到临头了还敢滚去睡你他妈的猪觉，你野爹我看你妈屄的是纯粹活腻了。',
		'你野爹我就没见过哪头猪狗交配出来的畸形儿，有你这野种般不要屄脸的。',
		'滚你妈屄的猪梦里等死去吧。',
		'你野爹我给你妈的屄脸了，你野爹我直接剁了你那死去亲爹的黑毛猪屌，插进你他妈的狗嘴筒子里嚼嚼嚼。',
		'趁你个傻屄搁梦里品着你妈那口无毛大臭屄意犹未尽的时候，抄起菜刀手起刀落剁了你的项上狗头，让你他妈了个屄的学你亲爹那个怂货装死。',
		'给你脸了，屄养的猪狗死到临头了还敢叫唤。',
		'你野爹我往你那对儿死爹死妈的灵堂里摆满电动炮机，放上一首忌日快乐助助兴。',
		'掀开你死爹死妈的棺材板，看看他俩的贱骨头烂肉，给身上爬满了的蛆虫喂得多么肥美。',
		'还不过瘾，干脆一脚踩在你死爹死妈的遗像上，冲着棺材里唾上几口沫子，赏你死爹死妈点儿玉液琼浆。',
		'再拉泡大的，喂你死爹死妈点儿美味佳肴。',
		'最后拿给你死爹死妈挖坟的铁锨，干烂你的屄脸。',
		'拿给你死爹死妈上供的香火，插烂你的屄嘴。',
		'拿你死爹死妈身上扒下来的寿衣，勒在你个傻屄的狗头上活活挣断。',
		'好让你们这死有余辜的一家三口，死无全尸地滚上黄泉路。',
		'想轮奸你亲妈得卵巢囊肿子宫肌瘤的艾滋病烂穴的日本鬼子，再来八百个靖国神社都不够供的。',
		'你亲爹这个贱奴当年要不是爬到人脚底下当狗，舔鞋摇着尾巴乞求日本天皇饶你狗爹一条贱命，哪儿来你这个猪狗杂交成功配种的短命畸胎。',
		'你野爹我现在正给你那个亲爹扒了猪皮戳瞎猪眼割下猪鼻剁掉猪屌，连带着从你亲爹肛门里淌出来的稀汤猪屎一块儿，喂回你亲爹的那张粪口，让你亲爹好好尝尝什么叫自产自销。',
		'再剖了猪肚，给那死肥猪的内脏挖个干净放了血送去屠宰场。',
		'等你亲爹彻底死球了，给他血乎拉碴地挂到楼房外墙上，趁着月黑风高COS晴天娃娃。',
		'你爷爷当年搁日本拍最劣质的无码AV，都因为性无能，只能被骂到滚去门外边儿，本色出演眼睁睁听着妻子在里边儿被干死却无能为力的废物。',
		'正当导演来了兴致，准备玩人兽的时候，你爷爷头一个报名，被母猪强上，这才有了你奶和你亲爹的狗命。',
		'你亲爹小时候，从你奶那头猪妈的四排奶头上，也没少嘬，怎么就还是遗传了你爷爷贱骨子里的低等基因？',
		'你妈没背景没文化没身材没本事，只能靠着午夜站街卖淫来挣上俩屄水儿，喂你长大成新一代杂交仔猪。',
		'就你妈的那给了僵尸都懒得肏的稀巴烂阴唇，哪个活人能看上啊？',
		'要不是你那个死于阴茎癌的狗爹发了情，霸王硬上弓给你妈这个快要痒死了的贱婊子穴中送炭地来了一发，又哪能有你这么个马眼长屁股上前列腺长脑子里肛门当嘴用一张开恨不得让你野爹我现在就往里灌粪的贱狗搁这儿叫叫叫。',
		'你妈那个外围招嫖女跟大街上发了情急需找条公狗往死里肏的没人要的流浪母狗的唯一区别，就是成功借种上了你亲爹这么个饭桶畜牲男。',
		'别说，两口子欠死玩意儿还挺他妈般配。',
		'你那个婊子妈当三当惯了，大臭屄让人入烂阴道壁脱垂掉出来摊在阴唇上，刚好当个贞操盖子。',
		'你那个嫖娼爹也不看看自己那根青春期没发育长得又小又短的鸡巴，配俩静脉曲张烂在阴囊里的癌睾丸，是怎么有脸滚去逛窑子的。',
		'没想到和你妈这个子宫稀巴烂就算捅到宫颈口也没啥感觉的淫乱荡妇放在一块儿，简直是天造地设的一对儿狗男女。',
		'才有了你这个血统纯正的低等杂交宠，搁网上无能叫唤的今天。',
		'你野爹我从你亲爹你妈你爷你奶里现挑一个宰杀了，趁热乎劲儿送去你贱父当年初肏你淫母的洞房门口，给里面没吃过猪头肉的妓女们好好开开荤。',
		'你那一辈子没个出息混吃等死的亲爹，也不知道当年是搁哪家风月场所，一屌相中你那亲妈的流脓大臭屄的。',
		'就你亲爹那软烂到插不进去，搁门口蹭不了两下子就喷了的废物鸡巴，也能让你亲妈那糜烂生疮皱巴子宫内膜种下你这颗受精狗卵。',
		'你低下狗头瞅瞅自个儿的那条烂鸡巴，爬去大街上找找看。',
		'路边儿有哪条母狗长得顺你狗眼，趁死之前滚过去给它配了留个种。',
		'不然等到你野爹我逛遍窑子，抓到正趴床上让人猛肏烂肛的你妈那个荡妇。',
		'拿块儿板砖直接塞进她生蛆的内阴里，转个稀巴烂给你亲妈活活爽死以后。',
		'这世上就再也没有和你妈一样儿，愿意大张双腿掰开烂穴给你插的婊子了。',
		'哟烂鸡巴东西，终于让你野爹我调教到长出屄嘴来了，会自个儿叫唤了。',
		'看来你野爹我没白干你那家那两条母狗，好歹给你这杂种屄得急哭了，知道跳出来露个狗头等你野爹我好好肏一肏了。',
		'不错继续，等你野爹我给你宰了以后，让你那在阴间受尽唾骂的列祖列宗们，好好挣挣烧给你个屄养的红纸钱。',
		'你野爹我当年去的你妈家肏的你妈才生的你，不然你妈就靠着你那阴茎勃起障碍的性无能爹，能生出来你这个欠死的？',
		'识相的趁早滚过来认祖归宗，没准儿还能让你野爹我网开一面，给你妈屄留个全尸。',
		'你野爹我二话不说，先给你亲妈那贱货的矬脸来上八百个巴掌，直到抽成烂泥。',
		'再拿口球蘸上你野爹我新鲜出炉的精液，一把塞进你亲妈那贱货的狗嘴。',
		'接着抄起炉子里烧红的火钩子，顺着你亲妈那贱货的小穴狠狠地插进去，一路捅烂你亲妈那贱货的阴蒂阴唇阴道宫颈子宫卵巢，肏得她嗷嗷叫。',
		'你妈看着你现在这屄样儿后，后悔当年刚怀上你这个败家东西的时候，没趁着胎动来一波脐带绕颈，给你个欠肏玩意儿勒死。',
		'你野爹我就是要在这儿一对一，宰杀你妈屄的畜牲八百遍。',
		'趁死之前，动动你那半拉猪脑，想想你野爹我是怎么把你这贱奴，连带着你那埋乱坟岗里的十八代老祖宗们，一块儿肏了个稀巴烂的。',
		'你老母早都让你野爹我冲烂了，还搁这儿不知死活地狗叫。',
		'你那亲母的淌汁大骚屄烂到滚去日本拍片，都能让一屋子十八个男优活活恶心到做不下去。',
		'只想着牵条狗进来给你母肏瘫了，好拿去投稿人兽题材。',
		'幸好狗子的鸡巴比你那不孕不育的亲爹强多了，才硬生生地插烂你亲母那肮脏糜烂的宫颈口，射爆你亲母那艾滋病的子宫，才怀上你这么个跨物种杂交的畸胎。',
		'就你这号，搁乡家老家旱厕里绿头苍蝇拉出来的，连吃粪喝汤都嫌清淡的蛆，也配搁这儿装上你妈的人模狗样了？',
		'先把你太爷爷的棺材板撬开，骨灰盒当润滑油倒一地。',
		'再把你这杂种倒吊着塞进去，你那短命阳痿爹的腐烂鸡巴当引子。',
		'你野爹我紫黑大屌直接从你屁眼捅穿你脊梁骨，一路顶到你太爷爷的骷髅盆腔里狂抽三小时。',
		'你野爹我直接把你母那三期梅毒烂成蜂窝煤的黑屄掰开，当成乡下茅坑的盖子给你盖上，让你这辈子都只能在里面泡着你亲母的脓血和野狗的陈年老精过日子。',
		'你搁这儿装什么人模狗样？',
		'你野爹我一脚把你踹回你母子宫里重造，你母估计还得感谢我，帮她把这坨废物胎儿，重新搅拌成一泡合格的屎汤。',
		'滚回去继续喝你母经血汤吧，贱蛆，省得浪费你野爹我一泡好尿给你照祖坟。',
		'你这死爹死母义务教育学不明白给人打工当狗使唤的低智无能下贱脑瘫奴才，趁早爬去九泉之下阴曹地府找老阎王报到，好让你野爹我提前联系好杀年猪的铺子别全宰完，留一头母的给你投胎用。',
		'等着你野爹我年夜饭上亲手将母猪扒了皮剔了骨开膛破肚，来给你这屄养的庆生。',
		'你这辈子最大的成就就是让你野爹我提前预订了屠宰场的VIP通道，专门给你这屄养的留一头最肥的母猪。',
		'不是给你投胎，是给你母下辈子继续当免费公共肉便器用的。',
		'等你野爹我年夜饭开席，第一刀先从你母子宫里剜出你这坨没发育完全的死胎，裹上孜然辣椒面，直接当开胃菜生吞下去，嚼得嘎嘣脆。',
		'当年你母子宫内膜上脱落下来的白带，咋就没把你亲爹那萎靡不振的精子给齁死，才遭了天谴意外怀孕生出来你这么个杂种。',
		'你母跪舔阎王爷的脚趾头，求他别把你家户口本直接销毁，留个空位给你，下辈子继续投胎成下贱脑残。',
		'你这坨从母狗三期梅毒子宫里被高压水枪冲出来的脓包胎儿，现在还敢在这儿张嘴？',
		'你母当年，被我用生锈铁钩，从子宫颈一直刮到卵巢。',
		'把你母那坨烂成蜂窝的肉壁全掏出来当抹布擦地，结果你这劣等残渣居然还顺着刮痕漏出来。',
		'可见你连被彻底抹杀的资格都没有，只配当一滩没人愿意踩的阴道分泌物。',
		'你现在打的每一个字，都是你母在阴间被轮奸时发出的哀嚎回音。',
		'我拿把电锯把你从中间一分为二，骨渣拿去打成粉，撒在你母火化炉里当助燃剂。',
		'让你们母子俩，下辈子继续在炼狱里，排队舔彼此的灰。',
		'要不是你野爹我当年奸杀你母时候忘了斩草除根，怎么能让你这条蛆从那死人堆里爬出来，愣是搁人类的化粪池子里，日复一日地舔食那肮脏的黏液苟活到现在。',
		'你野爹我当年亲手把你母从那堆被轮完的尸体里拖出来，用带锈的军刺从她子宫颈一路捅到喉管，把那坨布满弹孔、脓血和残精的烂肉整块剜下来，扔进化粪池里煮成一锅黑紫色的尸浆，浇在你这张比尸斑还恶心的狗脸上当满月酒。',
		'你野爹我撕烂你母那流脓的臭屄，把你母那个长满肌瘤的发炎子宫剁个稀巴烂，塞进你这个屄养的狗嘴里。',
		'你野爹我给你母那对儿早就让无数人嘬烂了的松垮塌陷的奶子割下来，打成肉泥灌进你那稀烂的肛门里，让你尝尝妈妈的味道。',
		'你野爹我给你亲爹的那根瘫软腐烂的鸡巴剁了，再配上增生红肿癌变的前列腺一块儿榨成汁，从你那一对儿扭曲的猪鼻倒进去，好让你们俩父子团聚。',
		'你野爹我给你母那一对黑到发臭的大小阴唇割下来，再加上你那细小短软到快要断了的屌一块儿下到锅里，给你全家来盘小鸡炖蘑菇。',
		'你野爹我拿根烧火棍，一口气捅烂你母眼睛鼻孔耳朵眼乳头尿道口阴道口肛门，让你那当惯了站街卖淫女的亲母，好好享受一下无孔不入的快感。',
		'你野爹我给你母那两瓣长了毛的屁股，跟你母那对儿乳头暴凸的奶子一块儿割下来，拼到一起揉成两个圆球。',
		'再顺着你母那狂喷淫水的黑屄塞进去，告诉她这是你的两条同母异父的蛆弟蛆妹。',
		'你野爹我拿铁钩子插进你亲爹的狗嘴里，搁那傻屄的嗓子眼儿一路插烂食道胃大肠小肠十二指肠直通肛门，给你亲爹穿成人肉串子架在火上，做成人彘。',
		'把你亲爹烤到皮开肉绽，当成螺纹自慰棒，插烂你母骚屄。',
		'你野爹我把你奶活剐了，给大肠头挑断抽出来当绳子，绕在你亲母那淫贱婊子的脖子上玩调教，直到活活勒死。',
		'你野爹我拿电钻给你那当婊子的亲母的阴道干个稀巴烂，让你母再也满足不了你那性无能的废物亲爹，然后抄起杀猪刀给你这个低能弱智脑瘫败类砍成血雾。',
		'再把你那短小到看不见的阴茎剁下来，狠狠地插进你亲母的屄里。',
		'让你这个败家的东西，临死前对着你那淫贱的母来上最后一发，好让你们一家三口死个和谐美满大团圆。',
		'你野爹我用铡刀砍断你狗母四肢，制成便携型肉便器精壶随时用鸡巴和枪杆子捅穿射入杂精。',
		'你淫贱婊子母如愿以偿圆满妓梦，自此奋发接客。',
		'直到用布满脓疮的梅毒三期阴道，把身患先天性脑萎缩的你作为实现共享骚屄的代表物屙出来。',
		'你那人牲同插最终暴毙畜圈的慰安母亲，也算变相实现了你的子孙梦。',
		'你野爹我一拳砸进你狗母赖以为生的生蛆阴道，直接贯穿癌症子宫，导致牠血浆飞溅爆屍当场。',
		'再掏出肠子勒死你这条畜牲，送你俩娼妓母子阴间团聚，你狗母就是你狗主子的精壶。',
		'你野爹我找条野狗肏你母骚臭黑屄，你父母这两条死母贱畜杂种野犬被本野爹当街虐杀。',
		'本野爹直接把你阳痿短命爹四肢扭断，发出骨骼碎裂的阵阵声响。',
		'再用铲粪的铲子将你阳痿爹四肢连根铲下，带着点点血肉滴落一地。',
		'遂将你短命阳痿爹艾滋梅毒晚期已经腐烂发臭，滴着点点浓水的烂黑小屌齐根斩断。',
		'痛的它跪在地上叫我爷爷，奉献你婊子母的卖身卖屄契，祈求本野爹来饶恕它的狗命。',
		'本野爹二话没说，用你婊子母在其骚臭烂屄里插了多年十米长的自慰铁棒，猛砸你短命爹的狗头。',
		'又一斧劈开，使它脑浆崩裂，头骨凹入腹腔而亡。',
		'你婊子母吓得屎尿横流，在旁边抠着骚屄求我肏它。',
		'你野爹我随后掏出30厘米的紫黑大屌，对准你婊子母臭屄，长驱直入疯狂抽插三天三夜。',
		'捅穿烂子宫精液射满腹腔，又送给路边野狗轮奸数日仍觉得不过瘾。',
		'于是我不惜动用珍藏许久的人造细菌，灌入你婊子母阴道，培养七七四十九天。',
		'导致它数种性病缠身，本就恶臭熏天的艾滋蜂窝烂屄，病变流脓遍布毒疮堪比粪坑。',
		'本野爹还觉得不过瘾，又把你阳痿短命爹腐烂发臭成棍的尸体，捅进你亲母的梅毒艾滋蜂窝烂屄。',
		'把你婊子母已经被本野爹和野狗捅的千疮百孔腐烂发臭流脓的艾滋梅毒子宫捅串捅烂，把你婊子母捅死。',
		'你母不是我肏死的，是你婊子母自己去动物园卖屄。',
		'你婊子母被各种野兽轮了一遍，最后被野狗阴茎卡住拔不出来堵死了。',
		'你婊子母暴毙横死街头，你怎么不去给它收尸？',
		'你母是我内射的，你这个小丑才知道真相吧。',
		'你母尸体印着一个二维码，我刻的，有我和你母做爱的30个视频。',
		'火化前赶紧给你母二维码拍下来，那不是尸斑，是爷爷我对你满满的爱。',
		'你母骨灰盒买好了吗？买好了我就开炉了。',
		'你母服务黑人去世属于是岗位上牺牲，你家门口应该挂个光荣之家牌子。',
		'滚出来解释一下，你母怎么被黑屌肏死的？',
		'怎么，你母骨灰凑齐了吗？天天在这念叨，是怕火葬场给你发错货了？',
		'你这可怜虫，你母屄被人炸成碎片了，你在这集卡呢？',
		'把你母拉去游街示众吧，毕竟你母挺该死的，能把你生出来你母就已经不配活着了。',
		'但是你就是下贱啊，天生贱种不是吗？',
		'一日为奴，终身下贱，你和你母一样的贱啊。',
		'遗传的不是吗？一脉相承，遗传基因很强大了。',
		'我给你母屄毛编成麻花辫，用打火机一把烧尽，给你母黑屄烧的发烂发臭。',
		'你母是不是挂牌求肏，免费且倒贴，无能且绝经啊。',
		'但是你母纪录片，并没有出现在国产区。',
		'你母不是一直在兽区吗',
		'你母跟你的片子是人兽专区是为什么呢？',
		'是因为你母和你都是贱狗吗？',
		'还是把你母扔井里冒充午夜凶铃吧。',
		'楚人美一下子给你母屄劈开，让你母拥有两个阴道，你老母骚肠血肉横飞。',
		'你母在停尸间诈尸醒了还不忘拍片，能不能学学你老母敬业精神。',
		'我给你母烂屄用水泥呼死，给你母水泥封屄，你母还在这跪地求饶啊。',
		'给你母扔河里污染水质，你母活着污染空气。',
		'你母是活着干你母了个臭屄？',
		'给你母送研究所去研究一下，为什么这么骚，为什么这么贱？',
		'给你整的像你母半死不活似的，好像你母死了，你比谁都高兴似的。',
		'你也是在这里哄堂大笑，我肏你母，你装那个大孝子了。',
		'你一天到晚你母活着不孝，你母死了乱吠。',
		'肏你母，你母也是跟你难舍难分了。',
		'你也是有那个恋母情结，你也是跟你母拍上那个母子电影。',
		'今天给你母泡那个福尔马林，你给你母那个大屄放博物馆展览去，肏你母，世界上最骚的骚屄',
		'那也是那个万婊之首了，肏你母，寻思有你母贱呢。',
		'南村群童欺你母老无力，给你母轮的屄水直流的。',
		'你母天天搁那个破草房子里玩，为了给你养家糊口的，牺牲自己的臭屄，为了给你换口吃的。',
		'我说白了，你但凡要是心里有你母，你就不至于给你母拉出来干这种行业，知道吗？',
		'365行，行行出状元，但是你母在卖屄这一块没人可比啊。',
		'你母可谓是行业楷模，你知道吗？你母卖屄不收钱还倒贴。',
		'老鸨见你母和爹卖屄卖沟子业绩太差了，穿生化服把你父母丢进消毒水里，疼得淋梅艾尖喉豆亖泰疯狂往外飚。',
		'结果你个畸形儿突然冒出来，原来是死胎性病屎组合出你这艾滋毒瘤子近亲产物。',
		'我昨天把你母阴唇凉拌了，请了三天流水席，每天十八桌。',
		'我拿一把鸭嘴钳打开你母海鲜屄，看看你是什么幼教环境。',
		'你这母狗，我把你胸前那两坨烂肉都割下来，手脚剁了塞你前后的狗洞里。',
		'扔到你母面前，让你母好好看看。',
		'你这残缺不齐的智商如此低能，本野爹勉为其难一套太极拳，柔中带刚绵软顺滑中隐含无数威势，一记野马分踪把你婊子母沾满淫水的阴道从中间残忍撕裂。',
		'可是你婊子母发黑的阴蒂和她破碎的阴道本是同根生，竟然一起从你婊子母下体脱落，让你婊子母发出了惨痛的哀嚎。',
		'你这种货色，属于是你母怀你的时候被你野爹我的大屌抽查，抽到你那个可怜的狗脑子了。',
		'肏到你母屄里漏着黑水，给你这个大傻屄生下来。',
		'三岁就失去了母亲，你那野狗母唯一的作用就是给你的野狗爹抽插，然后死了给路边的野狗加餐罢了。',
		'很好。我宣布从现在开始，你母嘴是全世界人民的公厕。',
		'有屎有尿，就往你婊子母嘴里送。',
		'这样人民们不用费神处理粪便，你母也吃饱了，我看是双赢。',
		'嗯？为什么感觉你的表情不太高兴的样子？',
		'你工人爷爷先锋队直接杀进你家，直接把你母屄公有化，饱含革命成分的浓精轮番中出你母资本主义阴道。',
		'我直接把你母扔进不粘锅猛炒，炒出淫水喂你爷爷喝。',
		'你爷爷喝了，宝刀不老直接肏的你媳妇大喊给你生个父亲。',
		'然后随便找个猪圈当你祖坟，给你爷爷扔进去，你爷爷直接还你个杂种兄弟。',
		'贱奴，你可知道什么叫厚颜无耻？',
		'就是我们不想肏，你非得把你母送过来，这就过分了。',
		'怎么着，你母怀你的时候，我们大鸟肏你嘴里了，等着让你母用嘴鉴定哪个是你生物爹是吧？',
		'你母这味觉够可以的，记性也不错。指不定你俩真跟你狗叔有血缘。',
		'无母脑瘫野狗玩意，先去给你被肏成肉便器的老母黑屄刷干净点方便接客吧。',
		'不然你这个和路边黑狗生的野种有什么用，只能在网上学你狗爹狂吠，然后被当路边一条踹死罢了。',
		'天天吃屎吃的嘴滂臭，还来网上露你那满嘴是屎的臭狗嘴。',
		'家里人死完了，还是你的野婊老母接不到客了？来你野爹我这咬人啊？野狗玩意。',
		'我开泥头车创到你母臭屄里，给你母流脓烂屄创成七彩子宫。',
		'你母死了，我用往生咒给你母超生。南无阿弥多婆夜哆他伽多夜。哆地夜他阿弥唎都婆毗。阿弥咧哆悉耽婆毗。阿弥喇哆毗迦兰帝。阿弥喇哆毗迦兰多。伽弥腻伽伽那枳多迦唎娑婆诃。往生净土神咒，你那可怜的母。',
		'你母太凄惨了，佛光舍利，金光出现。南无、喝啰怛那、哆啰夜耶，南无、阿唎耶，婆卢羯帝、烁钵啰耶，菩提萨埵婆耶，摩诃萨埵婆耶，摩诃、迦卢尼迦耶，唵，萨皤啰罚曳，数怛那怛写，南无、悉吉栗埵、伊蒙阿唎耶，婆卢吉帝、室佛啰楞驮婆，南无、那啰谨墀，醯利摩诃、皤哆沙咩，萨婆阿他、豆输朋，阿逝孕，萨婆萨哆、那摩婆萨哆，那摩婆伽，摩罚特豆。怛侄他。',
		'往生你母极乐无边，所生之处，常逢善王，所闻正法，悟甚深义。常逢善右、常逢好时。',
		'不为狂乱失念死，南無阿弥陀佛。渡你那可怜的母。',
		'你全家血癌白血病艾滋病梅毒晚期，你野爹我精子射的你母屄里多了，你脑子里都是你野爹我精子。',
		'多回家看看你那婊子母，贱屄都让我玩烂了。',
		'你母骚屄都被狗肏臭了，驴屌日的你母淫水直流，你在旁边兴奋的哇哇大吠，你也想上去肏你母？',
		'公共厕所一样，还敢搁这向你野爹我乱吠？',
		'你肏你母去吧，你母那三个孔堵不住你的嘴是不？',
		'你都没爹，你亲爹性功能缺失，所以才有了你，我是你野爹我。',
		'你野爹我当初肏你母太深，一泡浓精给你母大黑屄射穿射烂了，让你现在脑浆都是你野爹我精子和你母屄水混合物。',
		'你出生时候让你母臭屄给脑袋夹坏了成了唐氏，来跟你野爹我大逆不道。',
		'我当着你和你那阳痿绿帽奴爹面肏你母烂屄，直接把你母骚黑子宫臭屄拽出来当飞机杯玩，用完之后再拿来当烟灰缸，然后剩一坨烂肉在你母外阴垂着。',
		'你母那骚臭烂屄掰开免费送都没人肏，我把你母肏怀孕。',
		'然后你母还急着要，只能路边找了几条野狗和黑人肏它这个婊子。',
		'你和你那阳痿爹爽坏了，看你母那奶屄水被几条野狗兽交8p肏的乱喷。',
		'你激动坏了，跑去跪地上把你母屄水舔干净，然后你想肏死你母。',
		'可惜你母那子宫都被肏松了，连你母阴道一半都插不进去。',
		'我直接给你母臭贱黑屄上面纹个出入平安，然后给你母套上嚼子拿火钳打上你野爹我名字。',
		'你母一辈子是我母狗，你家里但凡有口气的母人都是你野爹我母狗，我随便玩你母玩你奶。',
		'你全家艾滋梅毒三期白血病尖锐湿疣癌症死绝了，你爷男同被人肏出来个淋病然后前列腺癌晚期，你奶你母艾滋病梅毒三期尖锐湿疣，全是太贱了让黑人和野狗肏的。',
		'你母卖屄卖的爽不爽，有这功夫不如多回家看看你婊子母，贱屄都让我玩烂了公共厕所一样。',
		'怪我了，当初把你母绞在树上日夜轮，轮出来你这不孝子跑来跟你野爹我大逆不道。',
		'我和几个黑人拿宰猪的刀轻轻一扫，就把你老娘晶状体和子宫内膜刺穿勾住，连着角膜完整的提出来拉着那残余的血丝做成电线，然后做成血红滤镜的顶级相机。',
		'你爷爷我拿起你老母从阴道中间劈开，架在烧烤架上面烤的点点糜烂，伴着血丝搅合成了新型塑胶轮胎，也完成了非洲特色轮胎烤肉的逆过程，然后剁成肉泥喂给非洲野狗。',
		'你知道吗贱奴，你母就是我养的一头母猪，你母臭屄天天被你野爹我肏，让我轮烂之后，专门拿到猪圈里面给公猪泄欲和配种。',
		'前几天我把你母扔到猪圈给公猪配种，你母被几头公猪轮了一整晚，你和你那阳痿亲就在旁边看着，那烂屄都被猪干臭了，叉的你母淫水直流。',
		'你母哭这哀求你救它，你在旁边兴奋的哇哇大吠，也想肏死你母，直接就拿你那小屌叉进你母阴道，只可惜你那小屌太小，连你母阴道的四分之一都进不去。',
		'你母搁你家被你和你亲爹没少玩吧，阴道又松又烂，可惜你拼尽全力也无法满足你母。',
		'我看着可怜，一刀就送你娘上了西天，然后把你老母头和黑子宫臭屄拽出来割掉拿去做飞机杯。',
		'黑人直接从你母喉管里面叉到你母眼球，把眼球涌出来。',
		'用完之后，你母狗头你野爹我拿去当尿壶了。',
		'腐烂之后赏给你，你激动坏了，赶紧拿去做飞机杯，把你小屌放进去。',
		'你个野种，你们一家老小天天泡个热水澡。',
		'给你的父母水煮煮熟，高温40°捞出配上孜然沾着吃。',
		'我承认，你母肉质很鲜美，再加上臭豆腐配腐乳，你母水煮腐肉就新鲜出炉了。',
		'你野爹我看着就压不住沙场豪情，上去就是一个强手裂颅，接屈人之威。这还不过瘾，反手一发蓄意轰拳，打的你母叹为观止。',
		'我直接把从你母身上取出的梅毒屄，剁碎了扔给你个废物的渴了三天重度脱水的废物爹。',
		'你的废物爹和旁边拴着的大黄抢夺你母屄肉末的样子，让爷属实笑的直不起腰。',
		'黑人看到你的爹把他们的飞机杯吃掉，直接把大黑屌捅进你废物爹的食管。',
		'你野爹我把你母输卵管打结锤爆，扣出来卵黄伴蒜汁给狗下饭。',
		'你那农民工穷爹，野猪母是不是只能卖淫供你读书上学啊，可惜你只考了个带专，去工地搬砖当别人的狗。晚上回家只能狗吠高潮。',
		'你那婊子母和你后爹结婚后，天天来找野爹我，想让我肏它。',
		'你母屄里流臭脓水，妇科疾病发展到晚期以后，你这本是你婊子母腹中的死胎，摇身一变成为一只臭岨。',
		'我把你母头放大风车上吱呀吱呀地转。',
		'你母葬礼那天，著名化学家弗里茨前来吊唁，不甚将口袋里的氢氯酸倒在了你母棺材上，刹那间你母肚皮和棺材板都一同被腐蚀冒烟，现场惊叹不已，连忙为实验鼓掌肏你母了。',
		'晚上把你母迷晕送给高层房间里内射了一晚上，你母屄都被肏烂掉了。',
		'可惜他们才不管你母屄烂不烂，你母就这样被肏了一晚上。',
		'第二天你去接你母，看到你母跟个母狗一样躺在床上撅着屁股，烂屄里面全是精。',
		'这时候，你接到电话，说你母他们很满意。',
		'你这畜牲激动的跳起来，就插进你母烂屄里，用他们的精液当润滑油，狠狠的肏你母。',
		'可惜你不知道，他们在房间里安上了摄像头，你肏你母事情被公布于众，人人都知道你是一个肏母狂魔。',
		'肏你母，你野爹我知道了之后直接对你发起邀请，一起肏你母屄。',
		'你母屄当年被天王你野爹我用热翔灌大黑屄，瞬间吸收迸发出一朵朵血花，引来了屎壳郎。',
		'你野爹我赶紧抽出大屌，猛插小屄扩成了太平洋。要不是你母脑子吃翔，还生不出你这个傻屄儿子。',
		'你的赞比亚婊子母昨天跪着求我强奸她，被我拒绝。',
		'因为我曾亲眼看见你婊子母在马路上，同时被888条野狗抽插她的大烂屄。',
		'出来再拿电锯追杀你母，这个点你母应该出去卖，我先去杀了你龟男老爹。',
		'你龟男爹和你奶正在约炮，我当场捉好，用电锯把你亲爹和你奶用电锯锯了半个小车的肉，再把我家恶犬放进来生吃你亲爹你奶。',
		'你母出去卖回来了，发现有一堆恶犬在生啖你奶的肉时被吓晕。',
		'你母头在里面发酵，屄里流出白浆，我剖开你母发现你母遗传多年在屄里的婴儿，我把婴儿掏出来才发现是你。',
		'我去给你洗干净，等你醒的时候，你就认我做亲爹。',
		'再给你母大骚屄来一发8000吨TNT洲际导弹，直接把你母炸上了冥王星，你母屄在太空中绽放。',
		'这位死爹死母孤儿你好，我是来自全国秘密组织ICA的特级杀手代号为007。',
		'接到上级安排，由于你母长期在非洲美国日本到处卖屄传播色情文化，甚至影响了当地政府。',
		'当地政府安排我前去杀你那卖屄母，事后组织会给你10万抚养费去孤儿院。',
		'杂种东西，今天你野爹我就来整治整治你。',
		'你母一身都是宝，上有奶可食，下有屄可舔，你母也真稀罕人。',
		'昨晚你野爹我玩你母的时候，运动健将罗志祥打电话来，叫你野爹我把你母借他几天。',
		'你野爹我那时候正在劲头上，谁知他给的实在太多了。',
		'你野爹我被迫穿上裤子，把你母用JD邮寄过去了(不包邮)。',
		'谁知几天后，你野爹我去取你母时候，发现你母被肏死了。',
		'所以我肏你母血屄，你母死和你野爹我真没关系，你野爹我只是你母中间商而已。',
		'你母被人贩子扎满了全身黑色的纹身，然后把你母送到种植园做黑奴。',
		'你母被黑鬼疯狂的插入，把你母屄插的发炎流浓水。',
		'100个黑鬼的肉棒对着你母，射的你母身上全是精液。',
		'你亲爹看到了，受不了，一下子变成了精神病，把你奶给搞怀孕了。',
		'你奶一直说好爽好爽，正好被你爷爷看见了。',
		'你爷爷一气之下，又变成了精神病，路上看见母猪就内射。',
		'然后奴隶主把你老婆当成母狗一样拴着。',
		'你老婆因为和奴隶主顶嘴，被奴隶主拿着冲击钻改装的自慰棒，钻的一直发大水。',
		'三峡大坝的水，都没你老婆这个母狗的那么多。',
		'你母火化场粘锅了，夜壶中出你母骨灰盒，你母被车压死，肠子都挂火腿肠厂去了，谁吃到谁惡心。',
		'欢迎收看你亲爹与你母大幅度动作不小心把你母肏死，从你母死屄里生出来的你屌屄娃娃。',
		'把你亲爹吊起来割掉屌，你亲爹无法肏回你母，死尸暴怒，把你大卸八块丢进你母尸体。',
		'死全家玩意，你母屌东西，你亲爹欲哭无泪跳河自尽，杂种畜牲玩意看见你的尸体，日边了她所有地方。',
		'爷一刀把你母剁成肉馅，塞在你亲爹屁眼里让他瞬间前列腺高潮，像死去的母狗一样趴在地上舔你母尸体。',
		'可惜生了岨，钻到你母尸体的肠子里啃，把你母大肠啃漏了，喷出屎来沾了你亲爹一身。',
		'你亲爹像老八一样吃光了屎，回过头对着你千疮百孔的母抽插，射出你这个小脑瘫。',
		'爷看着这一切，欣慰的笑了，又是一刀把你牛子砍断。',
		'爷来到你祖坟之后直接落泪，因为你祖宗全因为傻屄被愤怒群众挖出来曝尸荒野，已经散发出阵阵的恶臭。',
		'然而随后爷又笑出了声，因为那和爷有什么关系呢？',
		'我直接把你祖宗的尸骨树立起来当成保龄球，使用你母和你血肉模糊的尸体直接来了个12连击杀。',
		'爷直接邀请你这土狗一村的人来你家坟头载歌载舞，在你母和你的尸体上蹦迪的同时用你祖宗的尸骨开烧烤party。',
		'好家伙，那尸油滋滋的响，味道香极了，和你同村的叔叔阿姨们都发自内心的笑了。',
		'你母被刚果蛤蟆拱了屄，生了你这么个傻屄玩意。',
		'你母受不了你野爹我的虐待，拿着杀猪刀把你全家碎尸。',
		'可怜天下父母心，留了你一条小命，没想到你这种社会底层还是成了一个废物。',
		'我心疼你是个孤儿，这些年苦了你了，来你野爹我这儿学狗吠，你野爹我给你钱哦。',
		'你这杂种在说你母呢？',
		'不滚回窝里，看看你那婊子母那暴毙的尸体，早已高度腐化散发出浓烈的尸臭。',
		'巴不得买几瓶妇炎洁，洗一洗你母梅毒臭屄。',
		'今晚必把你那婊子母阴道割下来，洗干净送给家养的看门狼狗，做人体飞机杯嗷。',
		'再要把你奶奶吊在黄山迎客松上，让猴子无套内射老黑屄。',
		'你母得艾滋死了烧成了灰，到死都不知道艾滋是你传染的。',
		'都跟你说了多少遍别和公狗搞，你就是不听。',
		'现在好了，你母灵车在路上翻了，路过的野狗还对着你母遗照来了一发，和你母骨灰混在一起。',
		'江湖人称狗精婊骨通天膏，专治你祖传十八代的尖锐湿疣。',
		'把你婊子母杀了之后，一拳头干碎你母梅毒烂屄穴。',
		'你野爹我螺旋劈开你母狗脑袋，射在你婊子母乳头上，给非洲儿童吸奶。',
		'跟你婊子母做爱，做到你婊子母像个母狗一样。',
		'把肉棒塞进你婊子母每一个洞里，直到你婊子母休克在怡红院里。',
		'最后你高雅大恩人留了五十块，给你母来给你买尿不湿。',
		'你狗屄的亲爹眼见拿你母出去接客賺钱做的裤衩被人干碎后，派你这急先锋狗畜生出来咬人的样子孝死了。',
		'只可惜你母今晚后庭又得让你亲爹的毒龙钻观光一次，而你个狗畜生还在为你亲爹已经失败的卖屄计划自我高潮呢。',
		'傻屄，我是你活爹。',
		'我先用一根一米长的水晶屌，疯狂的给你母屄抽插，给你母屄整得像他母两个阴户连在一起翻过来了。',
		'然后直接往你母屄里灌汽油，整一根火柴点燃，直接塞到你母屄里面。',
		'你今晚准备吃汽油炸你母大黑屄。',
		'我直接驾驶一架F - 22猛禽战斗机，先爬升到15000千米的高空，然后极速俯冲下来，加速至1.5马赫的超音速，直接把你和你全家无情的贯穿。',
		'然后发射一枚AIM - 120红外线指导导弹，把你奶奶的子宫肌瘤打出来。',
		'他的血染红了长江黄河，而他的野爹却还拍手叫好。',
		'殊不知，你的狗婊子母已经被我使用7.62x39毫米穿甲弹无情的虐杀。',
		'而你这个畜生却还在这里幸灾乐祸，属于是千古第一大孝子。',
		'你野爹我举世无双的一刀，以雷霆万钧不及掩耳之势，给你婊子母全身上下一共切割了七七四十九刀，让你婊子母处于极度痛苦哀嚎中致死。',
		'我徒手插入你母蟑螂满窜的阴道，收集分泌物做成你亲爹调情剂，不想引来无数野狗肏你母屄。',
		'和你对话简直人狗交流，我帮你母绝育的时候，没把你母烂屄刨干净，导致村口杂种哈巴狗趁虚而入，往内射精生了你这野种，是我的错。',
		'我宰杀你梅毒婊子母，你母被我五马分尸，头被我拧下来挂在城楼上，路过的人都要给你母倒杯酒，祝她地狱卖屄继续红火。',
		'小废物，你母被野爹叫上几个非洲土著黑加白戳出18个洞，野爹还在上面拿小废物的睾丸打高尔夫球呢。',
		'我肏你母个屄死母崽，你野爹我一个大屄斗给你母扇出晕厥状态，然后拿起杀死你亲爹的开山刀，直接往你母屄里捅。',
		'捅完拿出来直接给你母奶子削掉，然后扒开你亲爹的肾，往你母奶子上倒津液。',
		'你母醒来之后，看到自己奶子被削掉了，直接吓得喊我爹。',
		'但是你野爹我不想当公交车的父亲，所以一刀削掉你母头，然后把你那个废物趋势爹的短屌插你母食道里，最后分尸你母喂给野狗吃。',
		'野狗闻了一下你母尸块，都连忙跑到厨房给我做四菜一汤。',
		'你母去世了，死因是被十条野狗的屌贯穿致死，然后分尸至今，你母尸体还是下落不明啊。',
		'我给你母阴道改成战斗机起飞场，然后让十架F - 22猛禽以一马赫的速度从你母屄上碾过去，使其高潮不断。',
		'你瘸子亲爹撸管的时候，被你野爹我肏你母的余波震死了。',
		'你那个婊子母还在跟你野爹我激情呢，你野爹我把你母血屄插翻了，子宫扔锅里煮了给野狗吃。',
		'野狗闻了也嫌臭，扔给你了你还觉得是绝世美味。',
		'连你婊子母头被割下来脑交了你都不知道，还在那里品尝美味，我也是看的爆笑如雷了。',
		'直接发动五雷轰顶，把你婊子亲母和瘸子亲爹都劈熟了扔进锅里，再把你婊子母人头当作装饰挂在你祖坟上。',
		'听着一声响，你野爹我就知道你全家大礼包熟了，我也是直接精美摆盘端给你吃了，你还恭恭敬敬的谢我。',
		'我肏你母了个狗杂种，你母早死就是傻屄了。',
		'你母当年被我扔到菲律宾妓院被奸杀的时候，被肏的可爽了，你都不知道是哪个人射出来的杂种。',
		'都忘了你母还和狗性交呢，你就是个狗杂种，你不知道吗？',
		'屌毛都没长齐，你和你亲爹一样都是硫酸泡屌的废物，菜的抠脚，然后我把你和你亲爹的狗脚都给砍了。',
		'我拿AK在你母鼻孔里面开枪，射死你母头，对着你母淫屄就是一枪。',
		'把你母屄射穿射的血肉模糊，然后你母死尸爆炸。',
		'把你母尸体烧了，我把你母头砍下来放你床上，你一醒来就可以挖你母鼻孔，吃你母鼻屎，你可开心了把傻屄东西。',
		'把你母骨灰熬成粥，给你补补你的蠢屄脑子。',
		'小屁孩冬瓜玩意在这狗吠，笑死我了，你多捞啊。',
		'死母孤儿你是什么傻屄，你回去咬你亲爹的烂屌。',
		'你亲爹当年硫酸泡屌，都忘了你和你亲爹一样是个没屌的杂种呢。',
		'哟还不服呢，狗吠你嘛呢垃圾废物，你野爹我把你亲爹的头拧下来，塞进你嘴里你个傻屄。',
		'屌你母，拿你亲爹骨灰和你亲爹屌毛煲汤，在里面撒上你爷爷的坟头草，喂你母喝。',
		'把你母丢到妓院里，把你母迷奸，你个狗杂种都不知道是谁的，回去看看你母屄里有没有我的精液。',
		'废物，你野爹我往你母狗嘴里塞狗屎，你母脑子里灌热油烫死你母，把你母猪头油炸撒上番茄汁，你滚回去吃你母番茄狗头猪油脸。',
		'你看你母丑屄样，我干你母血屄，把你母淫屄插，你母留着狗血把屄割了，你母奶奶尸体爆炸。',
		'你和你母连体孤儿傻屄，把你母吊起来，日烂她奶头，拿电锯锯开你亲爹烂屌，把你亲爹烂屌塞在你爷爷烂p眼里，你爷爷奶奶尸体的屄真好玩，我拿着刀捅。',
	];
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
			message: ` ${array.randomget()}`,
		});
	}

	if (event.message_type !== 'group') return;
	const own = await callOB11(ctx, 'get_group_member_info', { group_id: groupId, user_id: ownerqq, no_cache: true });
	const ms = await callOB11(ctx, 'get_group_member_list', { group_id: groupId, no_cache: true });
	const isguanli = ['owner', 'admin'].includes(own.role);
	const userid = [];
	const textlist = [];
	for (const obj of event.message) {
		if (obj.type === 'at') {
			userid.push(obj.data.qq);
		}
		if (obj.type === 'text') {
			textlist.push(obj.data.text);
		}
	}

	//自动检测大段文字
	if (textlist.join().length > 99 && isguanli) {
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
	if (!window.zuduan1 && isguanli) {
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
	if (!isAdmin && groupId != '774922031' && Math.random() < 0.1) {
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
		if (!isAdmin && ownlist.some((id) => userid.includes(id)) && textlist.some((t) => t.includes('妈') || t.includes('爹') || t.includes('爸') || t.includes('狗') || t.includes('逼'))) {
			callOB11(ctx, 'send_group_msg', {
				group_id: groupId,
				message: [
					{ type: 'at', data: { qq: userId } },
					{ type: 'text', data: { text: ` ${array.randomget()}` } },
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
				{ type: 'text', data: { text: ` ${array.randomget()}` } },
			],
		});
	}

	//指令反应
	if (!isAdmin && currentConfig.filterEnable && currentConfig.filterKeywords) {
		const keywords = currentConfig.filterKeywords.split('|').filter((k) => k);
		if (keywords.some((k) => msg.includes(k))) {
			try {
				await callOB11(ctx, 'delete_msg', { message_id: event.message_id });
				if (currentConfig.filterPunish === 'ban') {
					await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: userId, duration: 60 });
				} else if (currentConfig.filterPunish === 'kick') {
					await callOB11(ctx, 'set_group_kick_members', { group_id: groupId, user_id: [userId], reject_add_request: false });
				}
			} catch (e) {}
			return;
		}
	}
	const atSeg = Array.isArray(event.message) ? event.message.find((s) => s.type === 'at') : null;
	const targetId = atSeg ? String(atSeg.data?.qq) : null;
	if (isAdmin) {
		if (msg.startsWith('开始攻击')) {
			const targetQQ = targetId || msg.replace('开始攻击', '').trim();
			if (!targetQQ) {
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '请指定要攻击的用户 (@ 或 QQ号)' });
				return;
			}
			if (!currentConfig.targetedUsers.includes(targetQQ)) {
				currentConfig.targetedUsers.push(targetQQ);
			}
			saveConfig(ctx, { targetedUsers: currentConfig.targetedUsers });
			await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已开始攻击 ${targetQQ}` });
			return;
		}
		if (msg.startsWith('终止攻击')) {
			const targetQQ = targetId || msg.replace('终止攻击', '').trim();
			if (!targetQQ) {
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '请指定要终止攻击的用户 (@ 或 QQ号)' });
				return;
			}
			if (currentConfig.targetedUsers.includes(targetQQ)) {
				currentConfig.targetedUsers.remove(targetQQ);
				saveConfig(ctx, { targetedUsers: currentConfig.targetedUsers });
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已终止攻击 ${targetQQ}` });
			} else {
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `${targetQQ} 未在攻击列表中` });
			}
			return;
		}
		if (msg === '攻击列表') {
			if (currentConfig.targetedUsers.length === 0) {
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '当前没有被攻击的用户' });
			} else {
				const users = currentConfig.targetedUsers.join(', ');
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `当前被攻击的用户: ${users}` });
			}
			return;
		}
	}
	if (!msg.startsWith('/')) return;
	const parts = msg.split(/\s+/);
	const command = parts[0];
	if (isAdmin) {
		if (command === '/kick' && targetId) {
			await callOB11(ctx, 'set_group_kick_members', { group_id: groupId, user_id: [targetId], reject_add_request: false });
			await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已踢出成员 ${targetId}` });
			return;
		}
		if (command === '/ban' && targetId) {
			const time = parseInt(parts[2]) || 600;
			await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: targetId, duration: time });
			await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已禁言 ${targetId} ${time}秒` });
			return;
		}
		if (command === '/unban' && targetId) {
			await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: targetId, duration: 0 });
			await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已解除 ${targetId} 禁言` });
			return;
		}
		if (command === '/muteall') {
			await callOB11(ctx, 'set_group_whole_ban', { group_id: groupId, enable: true });
			return;
		}
		if (command === '/unmuteall') {
			await callOB11(ctx, 'set_group_whole_ban', { group_id: groupId, enable: false });
			return;
		}
		if (command === '/lockname') {
			const isSelf = !targetId;
			const operateTargetId = targetId || userId;
			let rawName = parts
				.slice(isSelf ? 1 : 2)
				.join(' ')
				.trim();
			try {
				if (rawName && rawName.includes('%')) {
					rawName = decodeURIComponent(rawName);
				}
			} catch (e) {}
			if (rawName) {
				rawName = decodeHtml(rawName);
			}
			const newName = rawName;
			await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: operateTargetId, card: newName });
			currentConfig.lockedNicknames[operateTargetId] = newName;
			saveConfig(ctx, { lockedNicknames: currentConfig.lockedNicknames });
			const operatorStr = isSelf ? '自己' : '管理员';
			await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已${operatorStr}锁定 ${operateTargetId} 的群名片为: ${newName}` });
		} else if (command === '/unlockname') {
			const isSelf = !targetId;
			const operateTargetId = targetId || userId;
			if (currentConfig.lockedNicknames[operateTargetId]) {
				delete currentConfig.lockedNicknames[operateTargetId];
				saveConfig(ctx, { lockedNicknames: currentConfig.lockedNicknames });
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已解除 ${operateTargetId} 的群名片锁定` });
			} else {
				await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '该用户未被锁定群名片' });
			}
		}
	}
}
async function onEvent(ctx, event) {
	if (event.notice_type == 'group_recall') {
		const message = huancun.get(event.message_id);
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
