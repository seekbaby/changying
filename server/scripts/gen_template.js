
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const serverDir = path.resolve(__dirname, '..');
const templateDir = path.join(serverDir, 'public', 'templates');
fs.mkdirSync(templateDir, { recursive: true });

const wb = XLSX.utils.book_new();
const headers = ['耗材名称', '单位', '安全库存', '进货数量', '备注'];
const sampleData = [
  ['玻尿酸', '支', '5', '20', '首次进货'],
  ['肉毒素', '支', '3', '10', ''],
  ['胶原蛋白', '支', '2', '15', '备货'],
];
const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
ws['!cols'] = [{wch:16},{wch:8},{wch:10},{wch:10},{wch:20}];
XLSX.utils.book_append_sheet(wb, ws, '耗材导入');

const outPath = path.join(templateDir, '耗材导入模板.xlsx');
XLSX.writeFile(wb, outPath);
console.log('OK:', outPath);
