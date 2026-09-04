class EventBus {
  constructor(){ this.map=new Map(); }
  on(event,handler){ if(typeof handler!=='function') throw new TypeError('handler'); const set=this.map.get(event)||new Set(); set.add(handler); this.map.set(event,set); return ()=>this.off(event,handler); }
  off(event,handler){ this.map.get(event)?.delete(handler); }
  emit(event,payload){ for(const handler of this.map.get(event)||[]) handler(payload); }
  clear(){ this.map.clear(); }
}
module.exports=EventBus;
