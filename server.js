const http=require('http'),fs=require('fs'),{WebSocketServer}=require('ws');
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(__dirname+'/index.html'))});
const wss=new WebSocketServer({server:srv});
const W=1600,H=1200,rooms={};let uid=1,mid=1;
const cl=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

wss.on('connection',(ws,req)=>{
  const q=new URL(req.url,'http://x').searchParams,code=(q.get('room')||'solo'+uid).slice(0,16);
  const r=rooms[code]||(rooms[code]={mode:q.get('mode')==='pvp'?'pvp':'coop',players:{},mons:[],t:0});
  if(Object.keys(r.players).length>=4){ws.send(JSON.stringify({err:'Salle pleine (4 max)'}));return ws.close()}
  const id=uid++,p={id,x:300+Math.random()*(W-600),y:300+Math.random()*(H-600),dx:0,dy:0,hp:100,max:100,dmg:8,spd:3.2,kills:0,cd:0,rez:0,tgt:null,ws};
  r.players[id]=p;
  ws.send(JSON.stringify({you:id,W,H,mode:r.mode}));
  ws.on('message',m=>{try{const d=JSON.parse(m),l=Math.hypot(d.dx,d.dy);if(l>0){const k=Math.min(1,l)/l;p.dx=d.dx*k;p.dy=d.dy*k}else p.dx=p.dy=0}catch{}});
  ws.on('close',()=>{delete r.players[id];if(!Object.keys(r.players).length)delete rooms[code]});
});

function nearest(p,list,range){let b=null,bd=range;for(const e of list){if(e===p||e.hp<=0)continue;const d=dist(p,e);if(d<bd){bd=d;b=e}}return b}
function reward(p){p.kills++;p.dmg+=.4;p.max+=2;p.hp=Math.min(p.max,p.hp+6)} // amélioration permanente à chaque kill

setInterval(()=>{
  for(const r of Object.values(rooms)){
    r.t++;const ps=Object.values(r.players),alive=ps.filter(p=>p.hp>0);
    for(const p of ps){
      if(p.hp<=0){if(--p.rez<=0){p.hp=p.max;p.x=W/2;p.y=H/2}continue}
      p.x=cl(p.x+p.dx*p.spd,0,W);p.y=cl(p.y+p.dy*p.spd,0,H);
    }
    if(r.mode==='coop'){ // vagues de monstres, plus nombreuses avec le nombre de joueurs et le temps
      const every=Math.max(6,30-ps.length*3-Math.floor(r.t/400));
      if(alive.length&&r.t%every===0&&r.mons.length<25+ps.length*10){
        const a=Math.random()*6.28,hp=15+r.t/60;
        r.mons.push({id:mid++,x:cl(W/2+Math.cos(a)*900,0,W),y:cl(H/2+Math.sin(a)*900,0,H),hp,max:hp,cd:0});
      }
      for(const m of r.mons){
        const t=nearest(m,alive,1e9);if(!t)continue;const d=dist(m,t)||1;
        if(d>20){m.x+=(t.x-m.x)/d*1.6;m.y+=(t.y-m.y)/d*1.6}
        else if(--m.cd<=0){m.cd=15;t.hp-=6+r.t/1200;if(t.hp<=0){t.rez=100;t.tgt=null}}
      }
    }
    for(const p of ps){ // attaque automatique : cible la plus proche
      if(p.hp<=0)continue;p.tgt=null;
      const t=nearest(p,r.mode==='coop'?r.mons:ps,170);
      if(t)p.tgt={x:t.x|0,y:t.y|0};
      if(p.cd>0){p.cd--;continue}
      if(t){p.cd=8;t.hp-=p.dmg;if(t.hp<=0){reward(p);if(r.mode==='pvp'){t.rez=60;t.tgt=null}}}
    }
    r.mons=r.mons.filter(m=>m.hp>0);
    const s=JSON.stringify({p:ps.map(p=>({id:p.id,x:p.x|0,y:p.y|0,hp:Math.ceil(p.hp),max:p.max,k:p.kills,t:p.tgt})),m:r.mons.map(m=>({id:m.id,x:m.x|0,y:m.y|0,r:m.hp/m.max}))});
    for(const p of ps)if(p.ws.readyState===1)p.ws.send(s);
  }
},50);
srv.listen(process.env.PORT||3000,()=>console.log('Jeu sur http://localhost:'+(process.env.PORT||3000)));
