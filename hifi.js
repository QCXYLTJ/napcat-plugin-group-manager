const cron = require('node-cron');
cron.schedule(
  '0 0 1 * * *',
  async () => {
    console.log(`【七彩祥云】: 开始签到...`);
    const response = await fetch('https://www.hifiti.com/sg_sign.htm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        Cookie: `
bbs_sid=r5hh91q3botsu446583tg7p0rm; bbs_token=MFR3wjEO8tGt_2Fht4fux5Z6Axtly87OchI00gjXkGgoz1ZWMze82ow6fvYe_2B6C1BwTp9yIFMQNjrAe9nTs3RU47qhROE_3D; Hm_lvt_23819a3dd53d3be5031ca942c6cbaf25=1769471841,1769518664,1770791427; HMACCOUNT=F711E4CA4C169F8C; Hm_lpvt_23819a3dd53d3be5031ca942c6cbaf25=1770794843`,
      },
    });
    if (!response.ok) {
      console.log(`网络请求出错 - ${response.status}`);
    }
    const responseJson = await response.json();
    if (responseJson.code === '0') {
      console.log(`【七彩祥云】: 签到成功。`);
    } else {
      if (responseJson.message === '今天已经签过啦！') {
        console.log(`【七彩祥云】: '今天已经签过啦！'`);
      }
      console.log(`签到失败: ${responseJson.message}`);
    }
  },
  {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  },
);