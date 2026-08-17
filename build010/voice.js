(()=>{
const SPEAKER=3,API='https://api.tts.quest/v3/voicevox/synthesis';
const speechMap=new Map([
['あなたのインナーチャイルド、今日も元気？','あなたのインナーチャイルド、今日も元気？'],
['尊厳が破壊される','尊厳が破壊される'],
['来るなら、来い','来るなら、来い'],
['次世代を代表するセルフエクスプレッショナー','次世代を代表するセルフエクスプレッショナー'],
['店味','てんみ'],
['アイブライト','アイブライト'],
['宇宙の采配','宇宙の采配'],
['感謝感激雨嵐','感謝感激、雨あらし'],
['草回避www','草回避'],
['のっぴきならない事情','のっぴきならない事情'],
['成ったか','なったか'],
['寝方ミスった','寝方ミスった'],
['みんな楽しんでくれててよかった','みんな楽しんでくれててよかった'],
['睡眠が壊れる','睡眠が壊れる'],
['ちゃんと出来るように頑張る。','ちゃんと出来るように頑張る。'],
['すみ！','すみ！'],
['にんげんは しっぱいするもの まなぶもの','にんげんは、しっぱいするもの。まなぶもの。'],
['モラルのある盗撮をお願いします','モラルのある盗撮をお願いします']
]);
const cache=new Map(),pending=new Map();let seq=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
quotePool.forEach(q=>q.speech=speechMap.get(q.text)||q.text);moralQuote.speech=speechMap.get(moralQuote.text)||moralQuote.text;
async function synth(text,attempt=0){
  if(cache.has(text))return cache.get(text);if(pending.has(text))return pending.get(text);
  const task=(async()=>{const u=new URL(API);u.searchParams.set('speaker',String(SPEAKER));u.searchParams.set('text',text);const r=await fetch(u,{mode:'cors',cache:'no-store'});const d=await r.json();if(d.retryAfter!=null&&attempt<4){await sleep((Number(d.retryAfter)+1)*1000);pending.delete(text);return synth(text,attempt+1)}const url=d.mp3StreamingUrl||d.mp3DownloadUrl;if(!url)throw new Error(d.errorMessage||'VOICE API error');cache.set(text,url);return url})();
  pending.set(text,task);try{return await task}finally{if(pending.get(text)===task)pending.delete(text)}
}
function stop(){if(activeVoice){activeVoice.pause();activeVoice.removeAttribute('src');activeVoice.load();activeVoice=null}}
function playUrl(url,mySeq){if(!voiceEnabled||mySeq!==seq)return;stop();const a=new Audio(url);activeVoice=a;a.preload='auto';a.volume=.92;a.addEventListener('ended',()=>{if(activeVoice===a)activeVoice=null},{once:true});a.play().catch(()=>{if(mySeq===seq)makeComment('ZUNDA VOICE READY — もう一度タップ',{top:'12%',size:'14px',color:'#ffd36f',duration:'2.8s'})})}
playQuoteVoice=function(q){if(!voiceEnabled||!q?.speech)return;const mySeq=++seq;stop();const ready=cache.get(q.speech);if(ready){playUrl(ready,mySeq);return}synth(q.speech).then(url=>playUrl(url,mySeq)).catch(e=>console.debug('Zundamon voice unavailable:',e))};
const toggle=document.getElementById('voiceToggle');
function sync(){toggle.textContent=voiceEnabled?'ZUNDA VOICE ON':'ZUNDA VOICE OFF';toggle.title='VOICEVOX:ずんだもんで名言を読み上げ'}
sync();toggle.onclick=()=>{voiceEnabled=!voiceEnabled;localStorage.setItem('fanVoiceEnabled',voiceEnabled?'1':'0');if(!voiceEnabled){seq++;stop()}sync()};
const credit=document.createElement('div');credit.style.cssText='margin-top:10px;font-size:9px;letter-spacing:.06em;color:#9fabb2;opacity:.9';credit.innerHTML='音声：<b style="color:#d7e7ef;font-weight:500">VOICEVOX:ずんだもん</b>';document.querySelector('.info')?.appendChild(credit);
const speeches=[...new Set([...quotePool.map(q=>q.speech),moralQuote.speech].filter(Boolean))];let i=0;
const warm=async()=>{if(i>=speeches.length)return;try{await synth(speeches[i])}catch(e){console.debug('Voice warmup skipped:',speeches[i])}i++;setTimeout(warm,700)};setTimeout(warm,900);
})();
