const CONFIG=require('../core/config');
class HistoryStore{
  constructor(storage){this.storage=storage;this.items=Array.isArray(storage.data.items)?storage.data.items:[];}
  add(entry){const item={title:entry.title||entry.url,url:entry.url,timestamp:entry.timestamp||Date.now()};this.items=[item,...this.items.filter(x=>x.url!==item.url)].slice(0,CONFIG.maxHistory);this.storage.data.items=this.items;this.storage.save();return item;}
  list(limit=CONFIG.maxHistory){return this.items.slice(0,limit);}
  search(q){q=String(q||'').toLowerCase();return this.items.filter(x=>(x.title+x.url).toLowerCase().includes(q));}
  clear(){this.items=[];this.storage.data.items=[];this.storage.save();}
}
module.exports=HistoryStore;
