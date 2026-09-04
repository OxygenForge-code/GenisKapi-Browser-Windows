const fs=require('fs'); const path=require('path');
class JsonStore{
  constructor(file,initial={}){this.file=file;this.initial=initial;this.data=this.load();}
  load(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{return structuredClone(this.initial);}}
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data,null,2),'utf8');return this.data;}
  replace(data){this.data=data;return this.save();}
}
module.exports=JsonStore;
