import { useState, useRef, useCallback, useEffect } from "react";

/* ───────── strategies ───────── */
const STRATEGIES = {
  passLine:         { name: "Pass Line",               description: "Bet on the shooter. Win on 7/11 come-out, lose on 2/3/12.", color: "#22c55e" },
  dontPass:         { name: "Don't Pass",              description: "Bet against the shooter. Win on 2/3, push 12, lose on 7/11.", color: "#ef4444" },
  passLineOdds:     { name: "Pass Line + 2x Odds",    description: "Pass line with double odds behind after point is set.", color: "#3b82f6" },
  dontPassOdds:     { name: "Don't Pass + 2x Odds",   description: "Don't pass with double lay odds after point is set.", color: "#f97316" },
  field:            { name: "Field Bet",               description: "Win on 2,3,4,9,10,11,12. Double on 2, triple on 12.", color: "#a855f7" },
  ironCross:        { name: "Iron Cross",              description: "Field + Place 5,6,8. Covers everything except 7.", color: "#eab308" },
  martingale:       { name: "Martingale Pass Line",    description: "Double pass line bet after each loss, reset after win.", color: "#ec4899" },
  conservative:     { name: "Conservative (Pass+Come)",description: "Pass line, then one Come bet. Minimal exposure.", color: "#06b6d4" },
  acrossMartingale: { name: "Across Place + Martingale",description: "Place 4,5,6,8,9,10. Double all after 7-out, reset on hit.", color: "#14b8a6" },
};

const PLACE_PAYOUTS = { 4:9/5, 5:7/5, 6:7/6, 8:7/6, 9:7/5, 10:9/5 };
const PLACE_NUMS = [4, 5, 6, 8, 9, 10];

function rollDice() { const d1=Math.floor(Math.random()*6)+1, d2=Math.floor(Math.random()*6)+1; return {d1,d2,total:d1+d2}; }

/* ───────── die face ───────── */
function DieFace({value,size=48,color="#1a1a2e"}) {
  const dots={1:[[50,50]],2:[[25,25],[75,75]],3:[[25,25],[50,50],[75,75]],4:[[25,25],[75,25],[25,75],[75,75]],5:[[25,25],[75,25],[50,50],[25,75],[75,75]],6:[[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]};
  return (<svg width={size} height={size} viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" rx="16" fill="#fffef5" stroke={color} strokeWidth="3"/>{(dots[value]||[]).map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="10" fill={color}/>)}</svg>);
}

/* ═══════ CUSTOM STRATEGY ═══════ */
const DEFAULT_CUSTOM = {
  name:"Full Press 5 Then Regress", color:"#f59e0b", placeNumbers:[4,5,6,8,9,10], includePassLine:true,
  buy410:false,
  rules:[{hitsFrom:1,hitsTo:5,action:"fullPress"},{hitsFrom:6,hitsTo:6,action:"regress"},{hitsFrom:7,hitsTo:999,action:"collect"}],
  on7out:"resetAll", collectProfitTarget:0, stopLossAmount:0,
};
const PRESETS = [
  {label:"Full Press 5 → Regress",value:{...DEFAULT_CUSTOM,name:"Full Press 5 Then Regress",rules:[{hitsFrom:1,hitsTo:5,action:"fullPress"},{hitsFrom:6,hitsTo:6,action:"regress"},{hitsFrom:7,hitsTo:999,action:"collect"}]}},
  {label:"Press Once → Collect",value:{...DEFAULT_CUSTOM,name:"Press Once Then Collect",rules:[{hitsFrom:1,hitsTo:1,action:"fullPress"},{hitsFrom:2,hitsTo:999,action:"collect"}]}},
  {label:"Half Press Forever",value:{...DEFAULT_CUSTOM,name:"Half Press Forever",rules:[{hitsFrom:1,hitsTo:999,action:"halfPress"}]}},
  {label:"Collect Everything",value:{...DEFAULT_CUSTOM,name:"Flat Collect",rules:[{hitsFrom:1,hitsTo:999,action:"collect"}]}},
  {label:"Power Press 3 → Regress",value:{...DEFAULT_CUSTOM,name:"Power Press 3 Regress",rules:[{hitsFrom:1,hitsTo:3,action:"powerPress"},{hitsFrom:4,hitsTo:4,action:"regress"},{hitsFrom:5,hitsTo:999,action:"collect"}]}},
  {label:"Spread Across → Collect",value:{...DEFAULT_CUSTOM,name:"Spread Across Then Collect",rules:[{hitsFrom:1,hitsTo:3,action:"spreadAcross"},{hitsFrom:4,hitsTo:999,action:"collect"}]}},
  {label:"Buy 4/10 + Spread",value:{...DEFAULT_CUSTOM,name:"Buy 4&10 Spread Across",buy410:true,rules:[{hitsFrom:1,hitsTo:4,action:"spreadAcross"},{hitsFrom:5,hitsTo:5,action:"regress"},{hitsFrom:6,hitsTo:999,action:"collect"}]}},
];
const ACTION_LABELS = {
  fullPress:{name:"Full Press",desc:"Add entire payout back onto bet",color:"#f97316"},
  halfPress:{name:"Half Press",desc:"Add half payout back, collect half",color:"#eab308"},
  powerPress:{name:"Power Press",desc:"Double current bet from payout+bankroll",color:"#ef4444"},
  collect:{name:"Collect",desc:"Take full payout as profit",color:"#22c55e"},
  regress:{name:"Regress",desc:"Take down to original base bet",color:"#3b82f6"},
  takeDown:{name:"Take Down",desc:"Remove bets entirely and collect",color:"#8b5cf6"},
  spreadAcross:{name:"Spread Across",desc:"Spread payout evenly across all active place numbers",color:"#14b8a6"},
};

function applyAction(action, currentBet, payout, baseBet) {
  switch(action){
    case "fullPress": return {profit:0,newBet:currentBet+payout};
    case "halfPress": {const p=Math.floor(payout/2);return{profit:payout-p,newBet:currentBet+p};}
    case "powerPress": {const d=currentBet*2,n=d-currentBet,fp=Math.min(payout,n);return{profit:payout-fp-(n-fp),newBet:d};}
    case "collect": return {profit:payout,newBet:currentBet};
    case "regress": {const diff=currentBet-baseBet;return{profit:payout+Math.max(diff,0),newBet:baseBet};}
    case "takeDown": return {profit:payout+currentBet,newBet:0};
    case "spreadAcross": return {profit:0,newBet:currentBet,spread:true,spreadAmount:payout};
    default: return {profit:payout,newBet:currentBet};
  }
}

/* ═══════ SIMULATION — now tracks table state for chips ═══════ */
function simulateStrategy(strategy, baseBet, numRolls, startingBankroll, customConfig) {
  let bankroll=startingBankroll, high=startingBankroll, low=startingBankroll;
  let point=null, wins=0, losses=0, currentBet=baseBet;
  let comePoint=null, comeBet=0;
  let placeBets={4:0,5:0,6:0,8:0,9:0,10:0};
  let passAmt=0, dontPassAmt=0, fieldAmt=0, oddsAmt=0;
  let hitCount=0, betsActive=false;

  function makeTableState() {
    return { passLine:passAmt, dontPass:dontPassAmt, field:fieldAmt, odds:oddsAmt,
      place:{...placeBets}, point, comePoint, comeBet };
  }

  let history=[{roll:0,bankroll,event:"Start",tableState:makeTableState()}];

  const isCustom = strategy==="custom";
  const cfg = isCustom ? customConfig : null;

  function getAction(hit) {
    if(!cfg) return "collect";
    for(const r of cfg.rules) if(hit>=r.hitsFrom&&hit<=r.hitsTo) return r.action;
    return "collect";
  }

  for (let i=0; i<numRolls; i++) {
    const {d1,d2,total}=rollDice();
    let event=`Roll ${total}`, rollWin=0, rollLoss=0;

    // Reset per-roll visual bets
    fieldAmt=0; oddsAmt=0;

    if (isCustom) {
      /* ─── CUSTOM ─── */
      const usePass = cfg.includePassLine;
      if (usePass) passAmt=baseBet; else passAmt=0;

      // Buy 4/10: pay 2:1 minus 5% vig on win. Place 4/10: pay 9:5
      function getPayoutRate(n) {
        if (cfg.buy410 && (n===4||n===10)) return 2.0; // buy pays 2:1
        return PLACE_PAYOUTS[n];
      }
      function getVig(n, payout) {
        if (cfg.buy410 && (n===4||n===10)) return payout * 0.05; // 5% commission
        return 0;
      }

      function handlePlaceHit(num) {
        hitCount++;
        const act=getAction(hitCount);
        const rawPay=placeBets[num]*getPayoutRate(num);
        const vig=getVig(num, rawPay);
        const pay=rawPay-vig;
        const res=applyAction(act,placeBets[num],pay,baseBet);

        if (res.spread) {
          // Spread payout evenly across all active place numbers
          const activeNums=cfg.placeNumbers.filter(n=>placeBets[n]>0||n===num);
          const perNum=Math.floor(res.spreadAmount/activeNums.length);
          const remainder=res.spreadAmount-(perNum*activeNums.length);
          activeNums.forEach(n=>{placeBets[n]+=perNum;});
          // leftover cents go to profit
          rollWin+=remainder;
          event=`Place ${num} HIT #${hitCount} — Spread $${res.spreadAmount.toFixed(0)} across ${activeNums.length} nums${vig>0?` (vig $${vig.toFixed(0)})`:""}`;
        } else {
          rollWin+=res.profit;
          placeBets[num]=res.newBet;
          event=`Place ${num} HIT #${hitCount} — ${ACTION_LABELS[act]?.name} +$${res.profit.toFixed(0)}${vig>0?` (vig $${vig.toFixed(0)})`:""} (bet→$${placeBets[num].toFixed(0)})`;
        }
        wins++;
      }

      if (usePass) {
        if (point===null) {
          if(total===7||total===11){rollWin+=baseBet;event=`Come-out ${total} — Pass WIN`;wins++;}
          else if([2,3,12].includes(total)){rollLoss+=baseBet;event=`Come-out ${total} — Pass LOSE`;losses++;}
          else{point=total;betsActive=true;hitCount=0;cfg.placeNumbers.forEach(n=>{placeBets[n]=baseBet;});event=`Point set: ${total} — bets ON${cfg.buy410?" (Buy 4&10)":""}`;}
        } else {
          if(total===point){
            rollWin+=baseBet;event=`Hit point ${total} — Pass WIN`;wins++;
            if(cfg.placeNumbers.includes(total)&&betsActive) handlePlaceHit(total);
            point=null;betsActive=false;Object.keys(placeBets).forEach(k=>{if(!betsActive)placeBets[k]=0;});
          } else if(total===7){
            rollLoss+=baseBet;const exp=betsActive?Object.values(placeBets).reduce((s,v)=>s+v,0):0;rollLoss+=exp;
            event=`SEVEN-OUT — Lose $${(baseBet+exp).toFixed(0)}`;losses++;
            point=null;betsActive=false;hitCount=0;Object.keys(placeBets).forEach(k=>{placeBets[k]=0;});
          } else if(cfg.placeNumbers.includes(total)&&betsActive){
            handlePlaceHit(total);
          } else event=`Roll ${total}`;
        }
      } else {
        if(!betsActive){betsActive=true;hitCount=0;cfg.placeNumbers.forEach(n=>{placeBets[n]=baseBet;});}
        if(total===7){const exp=Object.values(placeBets).reduce((s,v)=>s+v,0);rollLoss+=exp;event=`SEVEN — Lose $${exp.toFixed(0)}`;losses++;betsActive=false;hitCount=0;Object.keys(placeBets).forEach(k=>{placeBets[k]=0;});}
        else if(cfg.placeNumbers.includes(total)){
          handlePlaceHit(total);
        }
        else event=`Roll ${total} — no action`;
      }
    } else if (strategy==="passLine"||strategy==="passLineOdds"||strategy==="martingale") {
      const useOdds=strategy==="passLineOdds",isMart=strategy==="martingale";
      const bet=isMart?currentBet:baseBet; passAmt=bet; const ob=useOdds?baseBet*2:0;
      if(point===null){
        if(total===7||total===11){rollWin=bet;event=`Come-out ${total} — WIN`;wins++;if(isMart)currentBet=baseBet;}
        else if([2,3,12].includes(total)){rollLoss=bet;event=`Come-out ${total} — LOSE`;losses++;if(isMart)currentBet=Math.min(currentBet*2,bankroll);}
        else{point=total;event=`Point set: ${total}`;if(useOdds)oddsAmt=ob;}
      } else {
        if(useOdds)oddsAmt=ob;
        if(total===point){let payout=bet;if(useOdds){const op={4:2,5:1.5,6:1.2,8:1.2,9:1.5,10:2};payout+=ob*(op[point]||1);}rollWin=payout;event=`Hit point ${point} — WIN +$${payout.toFixed(0)}`;point=null;wins++;if(isMart)currentBet=baseBet;oddsAmt=0;}
        else if(total===7){rollLoss=bet+(useOdds?ob:0);event=`Seven-out — LOSE`;point=null;losses++;if(isMart)currentBet=Math.min(currentBet*2,bankroll);oddsAmt=0;}
        else event=`Roll ${total}, point is ${point}`;
      }
    } else if (strategy==="dontPass"||strategy==="dontPassOdds") {
      const useOdds=strategy==="dontPassOdds",ob=useOdds?baseBet*2:0; dontPassAmt=baseBet;
      if(point===null){
        if(total===2||total===3){rollWin=baseBet;event=`Come-out ${total} — WIN`;wins++;}
        else if(total===12){event=`Come-out 12 — PUSH`;}
        else if(total===7||total===11){rollLoss=baseBet;event=`Come-out ${total} — LOSE`;losses++;}
        else{point=total;event=`Point set: ${total}`;if(useOdds)oddsAmt=ob;}
      } else {
        if(useOdds)oddsAmt=ob;
        if(total===7){let payout=baseBet;if(useOdds){const lp={4:0.5,5:2/3,6:5/6,8:5/6,9:2/3,10:0.5};payout+=ob*(lp[point]||0.5);}rollWin=payout;event=`Seven-out — WIN +$${payout.toFixed(0)}`;point=null;wins++;oddsAmt=0;}
        else if(total===point){rollLoss=baseBet+(useOdds?ob:0);event=`Hit point ${point} — LOSE`;point=null;losses++;oddsAmt=0;}
        else event=`Roll ${total}, point is ${point}`;
      }
    } else if (strategy==="field") {
      fieldAmt=baseBet;
      if([2,3,4,9,10,11,12].includes(total)){let m=total===2?2:total===12?3:1;rollWin=baseBet*m;event=`Field ${total} — WIN${m>1?` (${m}x)`:""}`; wins++;}
      else{rollLoss=baseBet;event=`Field ${total} — LOSE`;losses++;}
    } else if (strategy==="ironCross") {
      fieldAmt=baseBet;[5,6,8].forEach(n=>{placeBets[n]=baseBet;});
      if(total===7){rollLoss=baseBet*4;event=`Seven — LOSE all`;losses++;[5,6,8].forEach(n=>{placeBets[n]=0;});}
      else if([2,3,4,9,10,11,12].includes(total)){let m=total===2?2:total===12?3:1;rollWin=baseBet*m;event=`${total} — Field WIN`;wins++;}
      else if([5,6,8].includes(total)){const pp={5:1.4,6:7/6,8:7/6};rollWin=(baseBet*(pp[total]||1))-baseBet;if(rollWin<0){rollLoss=-rollWin;rollWin=0;}event=`${total} — Place WIN`;wins++;}
    } else if (strategy==="conservative") {
      passAmt=baseBet;
      if(point===null){
        if(total===7||total===11){rollWin=baseBet;event=`Come-out ${total} — WIN`;wins++;comePoint=null;comeBet=0;}
        else if([2,3,12].includes(total)){rollLoss=baseBet;losses++;event=`Craps ${total}`;}
        else{point=total;comeBet=baseBet;event=`Point set: ${total}`;}
      } else {
        if(comePoint){if(total===comePoint){rollWin+=comeBet;comePoint=null;comeBet=baseBet;wins++;event=`Hit come ${total}`;}if(total===point){rollWin+=baseBet;point=null;wins++;event=`Hit point ${total}`;}else if(total===7){rollLoss=baseBet+comeBet;point=null;comePoint=null;comeBet=0;losses++;event=`Seven-out`;}}
        else if(comeBet>0){if(total===7){rollWin=comeBet;rollLoss=baseBet;point=null;comeBet=0;event=`Seven-out, come wins`;}else if(total===point){rollWin=baseBet;point=null;comeBet=0;wins++;event=`Hit point ${total}`;}else if([4,5,6,8,9,10].includes(total)&&total!==point){comePoint=total;event=`Come point: ${total}`;}else event=`Roll ${total}`;}
        else event=`Roll ${total}`;
      }
    } else if (strategy==="acrossMartingale") {
      const unitBet=currentBet;PLACE_NUMS.forEach(n=>{placeBets[n]=unitBet;});
      if(PLACE_NUMS.includes(total)){let payout=unitBet*PLACE_PAYOUTS[total];rollWin=payout;event=`Place ${total} HIT — WIN +$${payout.toFixed(0)}`;wins++;currentBet=baseBet;}
      else if(total===7){rollLoss=unitBet*6;event=`Seven-out — LOSE $${(unitBet*6).toFixed(0)}`;losses++;currentBet=Math.min(currentBet*2,bankroll);PLACE_NUMS.forEach(n=>{placeBets[n]=0;});}
      else event=`Roll ${total} — no action`;
    }

    bankroll+=rollWin-rollLoss;
    if(bankroll>high)high=bankroll; if(bankroll<low)low=bankroll;
    const ts=makeTableState();
    const h={roll:i+1,bankroll,event,d1,d2,total,tableState:ts};
    if(bankroll<=0){h.event="BUSTED";h.bankroll=0;history.push(h);break;}
    history.push(h);

    if(isCustom&&cfg.collectProfitTarget>0&&bankroll>=startingBankroll+cfg.collectProfitTarget){h.event+=" | PROFIT TARGET";break;}
    if(isCustom&&cfg.stopLossAmount>0&&bankroll<=startingBankroll-cfg.stopLossAmount){h.event+=" | STOP LOSS";break;}
  }
  // Reset non-persistent bets for display
  if(strategy==="field"||strategy==="ironCross") fieldAmt=0;
  return {history,high,low,final:bankroll,wins,losses};
}

/* ═══════════════════════════════════════
   CRAPS TABLE SVG — visual felt layout
   ═══════════════════════════════════════ */
function Chip({cx,cy,amount,color="#e2b714",size=18,pulse=false}) {
  if(!amount||amount<=0) return null;
  const label = amount>=1000?`${(amount/1000).toFixed(amount%1000===0?0:1)}k`:amount>=100?amount.toFixed(0):amount.toFixed(0);
  return (
    <g style={pulse?{animation:"chipPulse 0.4s ease-out"}:{}}>
      <circle cx={cx} cy={cy} r={size} fill="#111" stroke={color} strokeWidth="2.5" opacity="0.95"/>
      <circle cx={cx} cy={cy} r={size-4} fill="none" stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.6"/>
      <text x={cx} y={cy+4} textAnchor="middle" fill="#fff" fontSize={label.length>3?8:10} fontWeight="700" fontFamily="'JetBrains Mono',monospace">{label}</text>
    </g>
  );
}

function PointPuck({x,y,isOn,number}) {
  if(!isOn) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={12} fill="#fff" stroke="#222" strokeWidth="2"/>
      <text x={x} y={y+1} textAnchor="middle" dominantBaseline="middle" fill="#111" fontSize="8" fontWeight="900" fontFamily="'JetBrains Mono',monospace">ON</text>
    </g>
  );
}

function CrapsTable({tableState, lastTotal, d1, d2, activeColor, isAnimating, buy410}) {
  if(!tableState) return null;
  const {passLine,dontPass,field,odds,place,point,comePoint,comeBet} = tableState;
  // Table positions for place numbers
  const placeX = {4:128,5:212,6:296,8:380,9:464,10:548};
  const tw=660, th=320;
  const hitNum = lastTotal;

  return (
    <div style={{background:"#111122",borderRadius:10,border:"1px solid #1a1a2e",padding:"12px",marginBottom:14,position:"relative",overflow:"hidden"}}>
      <style>{`
        @keyframes chipPulse { 0%{transform:scale(1.4);opacity:0.5} 100%{transform:scale(1);opacity:1} }
        @keyframes diceRoll { 0%{transform:rotate(0deg) scale(0.5);opacity:0} 50%{transform:rotate(180deg) scale(1.2);opacity:1} 100%{transform:rotate(360deg) scale(1);opacity:1} }
        @keyframes hitGlow { 0%{opacity:0.8} 100%{opacity:0} }
      `}</style>
      <div style={{fontSize:8,color:"#444",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Craps Table</div>
      <svg width="100%" viewBox={`0 0 ${tw} ${th}`} style={{display:"block"}}>
        {/* Felt background */}
        <defs>
          <pattern id="felt" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#1a5c2a"/>
            <circle cx="1" cy="1" r="0.3" fill="#1d6630" opacity="0.5"/>
          </pattern>
        </defs>
        <rect x="4" y="4" width={tw-8} height={th-8} rx="20" fill="url(#felt)" stroke="#8b7332" strokeWidth="4"/>
        <rect x="10" y="10" width={tw-20} height={th-20} rx="16" fill="none" stroke="#c9a84c" strokeWidth="1.5" opacity="0.4"/>

        {/* ─── PASS LINE ─── */}
        <rect x="16" y={th-60} width={tw-32} height="44" rx="6" fill="#1a5c2a" stroke="#c9a84c" strokeWidth="1" opacity="0.7"/>
        <text x={tw/2} y={th-32} textAnchor="middle" fill="#c9a84c" fontSize="13" fontWeight="700" fontFamily="serif" opacity="0.9">P A S S &nbsp; L I N E</text>
        <Chip cx={100} cy={th-36} amount={passLine} color="#22c55e" pulse={isAnimating}/>
        {odds>0 && <Chip cx={140} cy={th-36} amount={odds} color="#3b82f6" size={15}/>}

        {/* ─── DON'T PASS ─── */}
        <rect x="16" y="16" width={tw-32} height="32" rx="6" fill="#1a5c2a" stroke="#c9a84c" strokeWidth="0.8" opacity="0.5"/>
        <text x={tw/2} y="37" textAnchor="middle" fill="#c9a84c" fontSize="10" fontWeight="600" fontFamily="serif" opacity="0.7">DON'T PASS BAR</text>
        <Chip cx={100} cy={32} amount={dontPass} color="#ef4444" pulse={isAnimating}/>

        {/* ─── COME ─── */}
        <rect x="20" y="130" width="80" height="50" rx="6" fill="#1a5c2a" stroke="#c9a84c" strokeWidth="0.8" opacity="0.5"/>
        <text x="60" y="160" textAnchor="middle" fill="#c9a84c" fontSize="11" fontWeight="600" fontFamily="serif" opacity="0.7">COME</text>
        <Chip cx={60} cy={148} amount={comeBet} color="#06b6d4"/>

        {/* ─── FIELD ─── */}
        <rect x="110" y={th-110} width={tw-230} height="38" rx="6" fill="#1a5c2a" stroke="#c9a84c" strokeWidth="1" opacity="0.6"/>
        <text x={110+(tw-230)/2} y={th-86} textAnchor="middle" fill="#c9a84c" fontSize="10" fontWeight="600" fontFamily="serif" opacity="0.8">F I E L D — 2 pays double • 12 pays triple</text>
        <Chip cx={180} cy={th-88} amount={field} color="#a855f7"/>

        {/* ─── PLACE NUMBERS ─── */}
        {[4,5,6,8,9,10].map(n=>{
          const x=placeX[n], w=76, bx=x-w/2;
          const isHit = hitNum===n && isAnimating;
          const isPoint = point===n;
          return (
            <g key={n}>
              <rect x={bx} y="54" width={w} height="66" rx="4" fill={isHit?"#2a7c3a":"#1a5c2a"} stroke="#c9a84c" strokeWidth="1" opacity={isHit?1:0.7}/>
              {isHit && <rect x={bx} y="54" width={w} height="66" rx="4" fill="#4ade80" opacity="0.15" style={{animation:"hitGlow 0.5s ease-out forwards"}}/>}
              <text x={x} y="78" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="900" fontFamily="'Playfair Display',serif" opacity="0.9">{n}</text>
              {n===6&&<text x={x+12} y="82" textAnchor="middle" fill="#c9a84c" fontSize="7" opacity="0.6">SIX</text>}
              {n===8&&<text x={x+12} y="82" textAnchor="middle" fill="#c9a84c" fontSize="7" opacity="0.6">EIGHT</text>}
              <text x={x} y="97" textAnchor="middle" fill="#c9a84c" fontSize="8" fontFamily="serif" opacity="0.5">
                {buy410&&(n===4||n===10)?"BUY 2 to 1":n===4||n===10?"9 to 5":n===5||n===9?"7 to 5":"7 to 6"}
              </text>
              {buy410&&(n===4||n===10)&&<rect x={x-16} y="56" width="32" height="12" rx="3" fill="#f59e0b" opacity="0.9"/>}
              {buy410&&(n===4||n===10)&&<text x={x} y="65" textAnchor="middle" fill="#000" fontSize="7" fontWeight="800" fontFamily="'JetBrains Mono',monospace">BUY</text>}
              <Chip cx={x} cy={108} amount={place[n]} color={activeColor} size={16} pulse={isHit}/>
              {isPoint && <PointPuck x={x} y={56} isOn={true} number={n}/>}
            </g>
          );
        })}

        {/* Come point marker */}
        {comePoint && placeX[comePoint] && (
          <g>
            <circle cx={placeX[comePoint]} cy={108} r={20} fill="none" stroke="#06b6d4" strokeWidth="2" strokeDasharray="4,3" opacity="0.7"/>
          </g>
        )}

        {/* ─── BIG 6 / BIG 8 ─── */}
        <rect x={tw-110} y="130" width="45" height="40" rx="4" fill="#1a5c2a" stroke="#c9a84c" strokeWidth="0.6" opacity="0.4"/>
        <text x={tw-87} y="155" textAnchor="middle" fill="#c9a84c" fontSize="10" fontFamily="serif" opacity="0.5">BIG 6</text>
        <rect x={tw-60} y="130" width="45" height="40" rx="4" fill="#1a5c2a" stroke="#c9a84c" strokeWidth="0.6" opacity="0.4"/>
        <text x={tw-37} y="155" textAnchor="middle" fill="#c9a84c" fontSize="10" fontFamily="serif" opacity="0.5">BIG 8</text>

        {/* ─── DICE ─── */}
        {d1 && d2 && (
          <g style={isAnimating?{animation:"diceRoll 0.3s ease-out"}:{}}>
            <foreignObject x={tw/2-50} y="170" width="44" height="44">
              <DieFace value={d1} size={42} color={activeColor}/>
            </foreignObject>
            <foreignObject x={tw/2+6} y="170" width="44" height="44">
              <DieFace value={d2} size={42} color={activeColor}/>
            </foreignObject>
            <text x={tw/2} y="230" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="'Playfair Display',serif" opacity="0.9">{d1+d2}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* ═══════════ Charts ═══════════ */
function MiniChart({data,color,width=200,height=50,startingBankroll}) {
  if(!data||data.length<2) return null;
  const vals=data.map(d=>d.bankroll),min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*width},${height-((v-min)/range)*(height-8)-4}`).join(" ");
  return (<svg width={width} height={height} style={{display:"block",flexShrink:0}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/></svg>);
}

function BigChart({data,color,startingBankroll,animIndex}) {
  if(!data||data.length<2) return null;
  const vis=animIndex!==undefined?data.slice(0,animIndex+1):data;
  const vals=vis.map(d=>d.bankroll),allV=data.map(d=>d.bankroll);
  const min=Math.min(...allV),max=Math.max(...allV),range=max-min||1;
  const w=800,h=220,pad=50,cw=w-pad*2,ch=h-pad-20;
  const pts=vals.map((v,i)=>`${pad+(i/Math.max(data.length-1,1))*cw},${20+ch-((v-min)/range)*ch}`).join(" ");
  const sy=20+ch-((startingBankroll-min)/range)*ch;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {Array.from({length:5}).map((_,i)=>{const y=20+(i/4)*ch;const val=max-(i/4)*range;return(<g key={i}><line x1={pad} y1={y} x2={w-pad} y2={y} stroke="#222" strokeWidth="0.5"/><text x={pad-8} y={y+4} fill="#555" fontSize="9" textAnchor="end" fontFamily="'JetBrains Mono',monospace">${val.toFixed(0)}</text></g>);})}
      <line x1={pad} y1={sy} x2={w-pad} y2={sy} stroke="#666" strokeWidth="1" strokeDasharray="6,4"/>
      {vals.length>1&&<polygon points={`${pad},${20+ch} ${pts} ${pad+((vals.length-1)/Math.max(data.length-1,1))*cw},${20+ch}`} fill="url(#cg)"/>}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {vals.length>0&&(()=>{const li=vals.length-1;const cx=pad+(li/Math.max(data.length-1,1))*cw;const cy=20+ch-((vals[li]-min)/range)*ch;return <circle cx={cx} cy={cy} r="4" fill={color} stroke="#0a0a12" strokeWidth="2"/>;})()}
    </svg>
  );
}

/* ═══════════ Styles ═══════════ */
const inputStyle={width:"100%",padding:"6px 8px",background:"#111122",color:"#e0e0e0",border:"1px solid #2a2a3e",borderRadius:5,fontSize:11,fontFamily:"inherit",boxSizing:"border-box"};
const smallBtn=(bg,fg)=>({padding:"5px 10px",background:bg,color:fg,border:`1px solid ${fg}44`,borderRadius:5,fontSize:10,fontFamily:"inherit",cursor:"pointer",letterSpacing:0.5});

/* ═══════════ Custom Builder ═══════════ */
function CustomBuilder({config,setConfig}) {
  const addRule=()=>{const last=config.rules[config.rules.length-1];const from=last?last.hitsTo+1:1;setConfig({...config,rules:[...config.rules,{hitsFrom:from,hitsTo:from+4,action:"collect"}]});};
  const removeRule=(idx)=>setConfig({...config,rules:config.rules.filter((_,i)=>i!==idx)});
  const updateRule=(idx,field,value)=>{const r=[...config.rules];r[idx]={...r[idx],[field]:field==="action"?value:Number(value)};setConfig({...config,rules:r});};
  const toggleNum=(n)=>{const nums=config.placeNumbers.includes(n)?config.placeNumbers.filter(x=>x!==n):[...config.placeNumbers,n].sort((a,b)=>a-b);setConfig({...config,placeNumbers:nums});};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div><div style={{fontSize:9,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Quick Presets</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{PRESETS.map((p,i)=>(<button key={i} onClick={()=>setConfig({...config,...p.value})} style={smallBtn("#1a1a2e","#f59e0b")}>{p.label}</button>))}</div></div>
      <div><label style={{fontSize:10,color:"#777",display:"block",marginBottom:3}}>Strategy Name</label>
        <input value={config.name} onChange={e=>setConfig({...config,name:e.target.value})} style={inputStyle}/></div>
      <div><label style={{fontSize:10,color:"#777",display:"block",marginBottom:3}}>Place Numbers</label>
        <div style={{display:"flex",gap:4}}>{PLACE_NUMS.map(n=>(<button key={n} onClick={()=>toggleNum(n)} style={{width:34,height:30,borderRadius:5,border:"1px solid #2a2a3e",fontSize:12,fontFamily:"inherit",cursor:"pointer",background:config.placeNumbers.includes(n)?"#f59e0b":"#111122",color:config.placeNumbers.includes(n)?"#000":"#666",fontWeight:config.placeNumbers.includes(n)?700:400}}>{n}</button>))}</div></div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div onClick={()=>setConfig({...config,includePassLine:!config.includePassLine})} style={{width:36,height:20,borderRadius:10,background:config.includePassLine?"#f59e0b":"#2a2a3e",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
          <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:config.includePassLine?18:2,transition:"left 0.2s"}}/></div>
        <span style={{fontSize:10,color:"#999"}}>Include Pass Line bet</span></div>
      {/* Buy 4/10 toggle */}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div onClick={()=>setConfig({...config,buy410:!config.buy410})} style={{width:36,height:20,borderRadius:10,background:config.buy410?"#f59e0b":"#2a2a3e",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
          <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:config.buy410?18:2,transition:"left 0.2s"}}/></div>
        <span style={{fontSize:10,color:"#999"}}>Buy 4 & 10 <span style={{color:"#666"}}>(2:1 - 5% vig)</span></span></div>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:9,color:"#555",letterSpacing:1.5,textTransform:"uppercase"}}>Press / Collect Rules</div>
          <button onClick={addRule} style={smallBtn("#f59e0b22","#f59e0b")}>+ Add Rule</button></div>
        <div style={{fontSize:9,color:"#444",marginBottom:8}}>Cumulative hit count across all place numbers per shooter run</div>
        {config.rules.map((rule,idx)=>(
          <div key={idx} style={{background:"#0f0f1e",border:"1px solid #1a1a2e",borderRadius:8,padding:"8px 10px",marginBottom:6,borderLeft:`3px solid ${ACTION_LABELS[rule.action]?.color||"#888"}`}}>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:10,color:"#888"}}>Hits</span>
              <input type="number" min={1} max={999} value={rule.hitsFrom} onChange={e=>updateRule(idx,"hitsFrom",e.target.value)} style={{...inputStyle,width:50,textAlign:"center"}}/>
              <span style={{fontSize:10,color:"#888"}}>to</span>
              <input type="number" min={1} max={999} value={rule.hitsTo} onChange={e=>updateRule(idx,"hitsTo",e.target.value)} style={{...inputStyle,width:50,textAlign:"center"}}/>
              <span style={{fontSize:10,color:"#888"}}>→</span>
              <select value={rule.action} onChange={e=>updateRule(idx,"action",e.target.value)} style={{...inputStyle,width:"auto",flex:1,minWidth:100,cursor:"pointer"}}>
                {Object.entries(ACTION_LABELS).map(([k,v])=>(<option key={k} value={k}>{v.name}</option>))}</select>
              {config.rules.length>1&&<button onClick={()=>removeRule(idx)} style={{...smallBtn("#ef444422","#ef4444"),padding:"3px 7px",fontSize:12}}>×</button>}
            </div>
            <div style={{fontSize:9,color:"#555",marginTop:3}}>{ACTION_LABELS[rule.action]?.desc}</div></div>))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><label style={{fontSize:10,color:"#777",display:"block",marginBottom:3}}>Profit Target ($0=off)</label>
          <input type="number" min={0} step={50} value={config.collectProfitTarget} onChange={e=>setConfig({...config,collectProfitTarget:Number(e.target.value)})} style={inputStyle}/></div>
        <div><label style={{fontSize:10,color:"#777",display:"block",marginBottom:3}}>Stop Loss ($0=off)</label>
          <input type="number" min={0} step={50} value={config.stopLossAmount} onChange={e=>setConfig({...config,stopLossAmount:Number(e.target.value)})} style={inputStyle}/></div>
      </div>
      <div style={{background:"#0f0f1e",borderRadius:8,padding:"10px 12px"}}>
        <div style={{fontSize:9,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Rule Timeline</div>
        <div style={{display:"flex",gap:2,height:24,borderRadius:4,overflow:"hidden"}}>
          {config.rules.map((rule,idx)=>{const span=Math.min(rule.hitsTo,20)-rule.hitsFrom+1;const c=ACTION_LABELS[rule.action]?.color||"#888";return(
            <div key={idx} style={{flex:Math.min(span,10),background:`${c}33`,borderLeft:`2px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:c,fontWeight:600,padding:"0 4px",whiteSpace:"nowrap",overflow:"hidden"}}>
              {ACTION_LABELS[rule.action]?.name} ({rule.hitsFrom}-{rule.hitsTo>100?"∞":rule.hitsTo})</div>);})}
        </div></div>
    </div>
  );
}

/* ═══════════ MAIN APP ═══════════ */
export default function CrapsSimulator() {
  const [strategy,setStrategy]=useState("passLine");
  const [baseBet,setBaseBet]=useState(10);
  const [numRolls,setNumRolls]=useState(1000);
  const [startingBankroll,setStartingBankroll]=useState(1000);
  const [speed,setSpeed]=useState(50);
  const [result,setResult]=useState(null);
  const [animIndex,setAnimIndex]=useState(null);
  const [isPlaying,setIsPlaying]=useState(false);
  const [liveEvent,setLiveEvent]=useState("");
  const [liveDice,setLiveDice]=useState(null);
  const [compareResults,setCompareResults]=useState(null);
  const animRef=useRef(null);
  const [tab,setTab]=useState("single");
  const [customConfig,setCustomConfig]=useState(DEFAULT_CUSTOM);
  const [showTable,setShowTable]=useState(true);
  const [showLog,setShowLog]=useState(true);
  const logRef=useRef(null);

  const activeColor=strategy==="custom"?customConfig.color:(STRATEGIES[strategy]?.color||"#888");
  const activeDesc=strategy==="custom"?`Custom: ${customConfig.rules.length} rule(s)`:(STRATEGIES[strategy]?.description||"");

  const runSim=useCallback(()=>{if(animRef.current)cancelAnimationFrame(animRef.current);const res=simulateStrategy(strategy,baseBet,numRolls,startingBankroll,customConfig);setResult(res);setAnimIndex(0);setIsPlaying(true);setLiveEvent(res.history[0]?.event||"");setLiveDice(null);},[strategy,baseBet,numRolls,startingBankroll,customConfig]);
  const runInstant=useCallback(()=>{if(animRef.current)cancelAnimationFrame(animRef.current);setIsPlaying(false);const res=simulateStrategy(strategy,baseBet,numRolls,startingBankroll,customConfig);setResult(res);setAnimIndex(res.history.length-1);setLiveEvent(res.history[res.history.length-1]?.event||"");const l=res.history[res.history.length-1];if(l)setLiveDice({d1:l.d1,d2:l.d2});},[strategy,baseBet,numRolls,startingBankroll,customConfig]);

  const runCompare=useCallback(()=>{
    if(animRef.current)cancelAnimationFrame(animRef.current);setIsPlaying(false);
    const allStrats={...STRATEGIES,custom:{name:customConfig.name,description:`Custom: ${customConfig.rules.length} rules`,color:customConfig.color}};
    const results={};
    Object.keys(allStrats).forEach(key=>{const runs=[];for(let r=0;r<20;r++)runs.push(simulateStrategy(key,baseBet,numRolls,startingBankroll,customConfig));const avg=fn=>runs.reduce((s,r)=>s+fn(r),0)/runs.length;
      results[key]={avgFinal:avg(r=>r.final),avgHigh:avg(r=>r.high),avgLow:avg(r=>r.low),bestRun:runs.reduce((b,r)=>r.final>b.final?r:b,runs[0]),worstRun:runs.reduce((b,r)=>r.final<b.final?r:b,runs[0]),bustRate:runs.filter(r=>r.final<=0).length/runs.length};});
    setCompareResults(results);
  },[baseBet,numRolls,startingBankroll,customConfig]);

  useEffect(()=>{
    if(!isPlaying||!result)return;let idx=animIndex||0;let lastTime=0;
    const step=ts=>{if(ts-lastTime>=speed){lastTime=ts;idx++;if(idx>=result.history.length){setIsPlaying(false);setAnimIndex(result.history.length-1);return;}setAnimIndex(idx);setLiveEvent(result.history[idx]?.event||"");setLiveDice({d1:result.history[idx]?.d1,d2:result.history[idx]?.d2});}animRef.current=requestAnimationFrame(step);};
    animRef.current=requestAnimationFrame(step);return()=>{if(animRef.current)cancelAnimationFrame(animRef.current);};
  },[isPlaying,result,speed]);

  // Auto-scroll log
  useEffect(()=>{
    if(logRef.current&&showLog){logRef.current.scrollTop=logRef.current.scrollHeight;}
  },[animIndex,showLog]);

  const curEntry=result&&animIndex!==null?result.history[Math.min(animIndex,result.history.length-1)]:null;
  const curBR=curEntry?.bankroll; const pnl=curBR!==null&&curBR!==undefined?curBR-startingBankroll:null;

  return (
    <div style={{minHeight:"100vh",background:"#0a0a12",color:"#e0e0e0",fontFamily:"'JetBrains Mono','Fira Code','Courier New',monospace"}}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1a0a0a 0%,#0a0a12 50%,#0a1a0a 100%)",borderBottom:"1px solid #222",padding:"12px 20px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:4}}><DieFace value={5} size={28} color="#c41e3a"/><DieFace value={2} size={28} color="#c41e3a"/></div>
        <div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,margin:0,background:"linear-gradient(90deg,#c41e3a,#ffd700)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:1}}>CRAPS SIMULATOR</h1>
          <div style={{fontSize:8,color:"#555",letterSpacing:3,textTransform:"uppercase"}}>Strategy Tester & Monte Carlo Engine</div>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:3}}>
          {[{k:"single",l:"Single"},{k:"custom",l:"Custom Builder"},{k:"compare",l:"Compare All"}].map(({k,l})=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:"5px 12px",background:tab===k?"#c41e3a":"transparent",color:tab===k?"#fff":"#888",border:`1px solid ${tab===k?"#c41e3a":"#333"}`,borderRadius:5,cursor:"pointer",fontSize:9,fontFamily:"inherit",textTransform:"uppercase",letterSpacing:1}}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",minHeight:"calc(100vh - 66px)"}}>
        {/* Sidebar */}
        <div style={{width:tab==="custom"?310:250,flexShrink:0,background:"#0d0d18",borderRight:"1px solid #1a1a2e",padding:"12px 10px",overflowY:"auto"}}>
          <div style={{fontSize:8,color:"#444",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Configuration</div>
          {tab!=="custom"&&(<>
            <label style={{fontSize:10,color:"#777",display:"block",marginBottom:3}}>Strategy</label>
            <select value={strategy} onChange={e=>setStrategy(e.target.value)} style={{...inputStyle,marginBottom:3,cursor:"pointer"}}>
              {Object.entries(STRATEGIES).map(([k,v])=>(<option key={k} value={k}>{v.name}</option>))}
              <option value="custom">✦ Custom Strategy</option>
            </select>
            <div style={{fontSize:9,color:"#555",marginBottom:10,lineHeight:1.5}}>{activeDesc}</div>
          </>)}
          {tab==="custom"&&(<>
            <div style={{fontSize:10,color:customConfig.color,fontWeight:600,marginBottom:8}}>✦ Custom Strategy Builder</div>
            {strategy!=="custom"&&<button onClick={()=>setStrategy("custom")} style={{...smallBtn(customConfig.color+"33",customConfig.color),width:"100%",marginBottom:10,padding:"8px",fontWeight:600}}>Activate Custom Strategy</button>}
            {strategy==="custom"&&<div style={{fontSize:9,color:"#22c55e",marginBottom:8,padding:"4px 8px",background:"#22c55e11",borderRadius:4,border:"1px solid #22c55e33"}}>✓ Active</div>}
            <CustomBuilder config={customConfig} setConfig={setCustomConfig}/><div style={{height:8}}/>
          </>)}

          {[{label:"Base Bet ($)",value:baseBet,set:setBaseBet,min:1,max:500,step:5},{label:"Bankroll ($)",value:startingBankroll,set:setStartingBankroll,min:100,max:100000,step:100},{label:"Rolls",value:numRolls,set:setNumRolls,min:10,max:100000,step:10}].map(({label,value,set,min,max,step})=>(
            <div key={label} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><label style={{fontSize:10,color:"#777"}}>{label}</label><span style={{fontSize:11,color:activeColor,fontWeight:500}}>{value.toLocaleString()}</span></div>
              <input type="range" min={min} max={max} step={step} value={value} onChange={e=>set(Number(e.target.value))} style={{width:"100%",accentColor:activeColor}}/></div>))}

          <div style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><label style={{fontSize:10,color:"#777"}}>Speed</label><span style={{fontSize:11,color:"#999"}}>{speed}ms</span></div>
            <input type="range" min={1} max={200} value={speed} onChange={e=>setSpeed(Number(e.target.value))} style={{width:"100%",accentColor:"#666"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#444"}}><span>Fast</span><span>Slow</span></div>
          </div>

          {/* Table toggle */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div onClick={()=>setShowTable(!showTable)} style={{width:36,height:20,borderRadius:10,background:showTable?"#22c55e":"#2a2a3e",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:showTable?18:2,transition:"left 0.2s"}}/></div>
            <span style={{fontSize:10,color:"#999"}}>Show Table</span>
          </div>
          {/* Log toggle */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div onClick={()=>setShowLog(!showLog)} style={{width:36,height:20,borderRadius:10,background:showLog?"#22c55e":"#2a2a3e",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:showLog?18:2,transition:"left 0.2s"}}/></div>
            <span style={{fontSize:10,color:"#999"}}>Show Roll Log</span>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:10}}>
            {tab!=="compare"?(<>
              <button onClick={()=>{if(tab==="custom")setStrategy("custom");runSim();}} style={{padding:"8px",background:`linear-gradient(135deg,${activeColor},${activeColor}88)`,color:"#fff",border:"none",borderRadius:7,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>▶ Run Live</button>
              <button onClick={()=>{if(tab==="custom")setStrategy("custom");runInstant();}} style={{padding:"8px",background:"transparent",color:activeColor,border:`1px solid ${activeColor}66`,borderRadius:7,fontSize:11,fontFamily:"inherit",cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>⚡ Instant</button>
            </>):(<button onClick={runCompare} style={{padding:"8px",background:"linear-gradient(135deg,#c41e3a,#ffd700)",color:"#fff",border:"none",borderRadius:7,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>⚡ Compare All (20 runs)</button>)}
          </div>
          {tab!=="compare"&&result&&(
            <div style={{marginTop:10,display:"flex",gap:5}}>
              <button onClick={()=>setIsPlaying(!isPlaying)} style={{flex:1,padding:"5px",background:"#1a1a2e",color:"#aaa",border:"1px solid #2a2a3e",borderRadius:5,fontSize:10,fontFamily:"inherit",cursor:"pointer"}}>{isPlaying?"⏸ Pause":"▶ Resume"}</button>
              <button onClick={()=>{setAnimIndex(result.history.length-1);setIsPlaying(false);}} style={{flex:1,padding:"5px",background:"#1a1a2e",color:"#aaa",border:"1px solid #2a2a3e",borderRadius:5,fontSize:10,fontFamily:"inherit",cursor:"pointer"}}>⏭ Skip</button>
            </div>)}
        </div>

        {/* Main */}
        <div style={{flex:1,padding:"12px 16px",overflowY:"auto"}}>
          {(tab==="single"||tab==="custom")&&(<>
            {/* Live status bar */}
            {result&&(
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,padding:"8px 12px",background:"#111122",borderRadius:8,border:"1px solid #1a1a2e"}}>
                {liveDice&&<div style={{display:"flex",gap:4}}><DieFace value={liveDice.d1} size={32} color={activeColor}/><DieFace value={liveDice.d2} size={32} color={activeColor}/></div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:"#ddd",fontWeight:500}}>{liveEvent}</div>
                  <div style={{fontSize:9,color:"#555"}}>Roll {animIndex!==null?Math.min(animIndex,result.history.length-1):0} / {result.history.length-1}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:18,fontWeight:700,color:activeColor}}>${curBR?.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})||"—"}</div>
                  <div style={{fontSize:11,color:pnl>=0?"#22c55e":"#ef4444"}}>{pnl>=0?"+":""}{pnl?.toFixed(0)||0}</div>
                </div>
              </div>
            )}

            {/* Chart */}
            {result&&(
              <div style={{background:"#111122",borderRadius:9,border:"1px solid #1a1a2e",padding:"10px",marginBottom:12}}>
                <div style={{fontSize:8,color:"#444",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Bankroll</div>
                <BigChart data={result.history} color={activeColor} startingBankroll={startingBankroll} animIndex={animIndex}/>
              </div>
            )}

            {/* CRAPS TABLE */}
            {result && showTable && (
              <CrapsTable
                tableState={curEntry?.tableState}
                lastTotal={curEntry?.total}
                d1={curEntry?.d1} d2={curEntry?.d2}
                activeColor={activeColor}
                isAnimating={isPlaying}
                buy410={strategy==="custom"&&customConfig.buy410}
              />
            )}

            {/* ROLL LOG */}
            {result && showLog && (()=>{
              const visibleCount = Math.min(animIndex!==null?animIndex+1:result.history.length, result.history.length);
              const entries = result.history.slice(Math.max(0,visibleCount-200), visibleCount);
              return (
                <div style={{background:"#111122",borderRadius:9,border:"1px solid #1a1a2e",padding:"10px",marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontSize:8,color:"#444",letterSpacing:2,textTransform:"uppercase"}}>Roll Log</div>
                    <div style={{fontSize:9,color:"#555"}}>{visibleCount-1} / {result.history.length-1} rolls</div>
                  </div>
                  <div ref={logRef} style={{maxHeight:220,overflowY:"auto",fontFamily:"'JetBrains Mono',monospace",fontSize:10,lineHeight:1.8}}>
                    {/* Header row */}
                    <div style={{display:"grid",gridTemplateColumns:"50px 44px 1fr 90px 80px",gap:6,padding:"4px 6px",borderBottom:"1px solid #1a1a2e",position:"sticky",top:0,background:"#111122",zIndex:1}}>
                      <span style={{color:"#555",fontWeight:700}}>Roll</span>
                      <span style={{color:"#555",fontWeight:700}}>Dice</span>
                      <span style={{color:"#555",fontWeight:700}}>Event</span>
                      <span style={{color:"#555",fontWeight:700,textAlign:"right"}}>Bankroll</span>
                      <span style={{color:"#555",fontWeight:700,textAlign:"right"}}>P&L</span>
                    </div>
                    {entries.map((entry,i)=>{
                      const isWin = entry.event.includes("WIN")||entry.event.includes("HIT #");
                      const isLose = entry.event.includes("LOSE")||entry.event.includes("SEVEN")||entry.event.includes("BUSTED");
                      const isPoint = entry.event.includes("Point set")||entry.event.includes("bets ON");
                      const isPush = entry.event.includes("PUSH");
                      const isTarget = entry.event.includes("PROFIT TARGET")||entry.event.includes("STOP LOSS");
                      const entryPnl = entry.bankroll - startingBankroll;
                      const rowColor = isWin?"#22c55e44":isLose?"#ef444422":isPoint?"#3b82f622":isTarget?"#f59e0b33":"transparent";
                      const textColor = isWin?"#4ade80":isLose?"#f87171":isPoint?"#60a5fa":isPush?"#888":"#ccc";

                      return (
                        <div key={entry.roll+"-"+i} style={{display:"grid",gridTemplateColumns:"50px 44px 1fr 90px 80px",gap:6,padding:"3px 6px",background:rowColor,borderBottom:"1px solid #0a0a12",borderRadius:2}}>
                          <span style={{color:"#666"}}>#{entry.roll}</span>
                          <span style={{color:"#888"}}>{entry.d1&&entry.d2?`⚁${entry.d1+entry.d2}`:""}</span>
                          <span style={{color:textColor,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.event}</span>
                          <span style={{color:entry.bankroll>=startingBankroll?"#4ade80":"#f87171",textAlign:"right",fontWeight:500}}>${entry.bankroll.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                          <span style={{color:entryPnl>=0?"#22c55e":"#ef4444",textAlign:"right"}}>{entryPnl>=0?"+":""}{entryPnl.toFixed(0)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Stats */}
            {result&&animIndex>=result.history.length-1&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
                {[
                  {label:"Final",value:`$${result.final.toLocaleString()}`,color:result.final>=startingBankroll?"#22c55e":"#ef4444"},
                  {label:"Highest",value:`$${result.high.toLocaleString()}`,color:"#ffd700"},
                  {label:"Lowest",value:`$${result.low.toLocaleString()}`,color:"#ff6b6b"},
                  {label:"P&L",value:`${result.final-startingBankroll>=0?"+":""}$${(result.final-startingBankroll).toLocaleString()}`,color:result.final>=startingBankroll?"#22c55e":"#ef4444"},
                  {label:"Wins",value:result.wins,color:"#22c55e"},{label:"Losses",value:result.losses,color:"#ef4444"},
                  {label:"Win Rate",value:`${((result.wins/Math.max(result.wins+result.losses,1))*100).toFixed(1)}%`,color:"#3b82f6"},
                  {label:"Rolls",value:result.history.length-1,color:"#888"},
                ].map(({label,value,color})=>(
                  <div key={label} style={{background:"#111122",borderRadius:7,border:"1px solid #1a1a2e",padding:"8px 10px"}}>
                    <div style={{fontSize:8,color:"#444",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>{label}</div>
                    <div style={{fontSize:14,fontWeight:700,color}}>{value}</div></div>))}
              </div>
            )}

            {!result&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:400,textAlign:"center"}}>
                <div>
                  <div style={{display:"flex",justifyContent:"center",gap:5,marginBottom:18,opacity:0.3}}>
                    {[3,1,6,4,2,5].map((v,i)=><DieFace key={i} value={v} size={32} color="#444"/>)}</div>
                  <div style={{fontSize:13,color:"#444",fontWeight:500}}>{tab==="custom"?"Build your strategy, then click Run":"Select a strategy and click Run"}</div>
                </div>
              </div>
            )}
          </>)}

          {/* Compare tab */}
          {tab==="compare"&&(<>
            {compareResults?(
              <div>
                <div style={{fontSize:8,color:"#444",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
                  Comparison — 20 runs × {numRolls.toLocaleString()} rolls — ${baseBet} bet — ${startingBankroll.toLocaleString()} bankroll</div>
                <div style={{display:"grid",gap:6}}>
                  {(()=>{const allStrats={...STRATEGIES,custom:{name:customConfig.name,description:`Custom: ${customConfig.rules.length} rules`,color:customConfig.color}};
                    return Object.entries(allStrats).filter(([k])=>compareResults[k]).sort(([a],[b])=>(compareResults[b]?.avgFinal||0)-(compareResults[a]?.avgFinal||0)).map(([key,strat],rank)=>{
                      const cr=compareResults[key];const pnlV=cr.avgFinal-startingBankroll;const isC=key==="custom";
                      return(<div key={key} style={{background:isC?"#181820":"#111122",borderRadius:8,border:`1px solid ${strat.color}${isC?"44":"22"}`,borderLeft:`3px solid ${strat.color}`,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:`${strat.color}22`,color:strat.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>#{rank+1}</div>
                        <div style={{flex:"1 1 120px",minWidth:100}}><div style={{fontSize:11,fontWeight:600,color:strat.color}}>{isC&&"✦ "}{strat.name}</div><div style={{fontSize:8,color:"#555"}}>{strat.description}</div></div>
                        <MiniChart data={cr.bestRun.history} color={strat.color} width={130} height={32} startingBankroll={startingBankroll}/>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"right",flexShrink:0}}>
                          {[{l:"Avg P&L",v:`${pnlV>=0?"+":""}$${pnlV.toFixed(0)}`,c:pnlV>=0?"#22c55e":"#ef4444"},{l:"Avg High",v:`$${cr.avgHigh.toFixed(0)}`,c:"#ffd700"},{l:"Avg Low",v:`$${cr.avgLow.toFixed(0)}`,c:"#ff6b6b"},
                            {l:"Best",v:`$${cr.bestRun.final.toFixed(0)}`,c:"#22c55e"},{l:"Worst",v:`$${cr.worstRun.final.toFixed(0)}`,c:"#ef4444"},{l:"Bust",v:`${(cr.bustRate*100).toFixed(0)}%`,c:cr.bustRate>0.3?"#ef4444":"#888"}
                          ].map(({l,v,c})=>(<div key={l}><div style={{fontSize:7,color:"#444",textTransform:"uppercase"}}>{l}</div><div style={{fontSize:11,fontWeight:600,color:c}}>{v}</div></div>))}
                        </div></div>);});})()}
                </div>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:400,textAlign:"center"}}>
                <div><div style={{fontSize:13,color:"#444",fontWeight:500}}>Compare All Strategies + Custom</div></div>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
