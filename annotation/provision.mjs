import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';

if(process.argv.length!==3)throw Error('Provide a new private directory for teacher credentials.');
const dest=path.resolve(process.argv[2]);
await mkdir(dest,{mode:0o700});
const password=()=>randomBytes(24).toString('base64url');
const sha=value=>createHash('sha256').update(value).digest('hex');
const teacher=password(),admin=password();
await writeFile(path.join(dest,'teacher-secrets.json'),JSON.stringify({
 ARROW_TEACHER_SHA256:sha(teacher),ARROW_ADMIN_SHA256:sha(admin)
}),{mode:0o600,flag:'wx'});
await writeFile(path.join(dest,'教師版登入資料.txt'),`教師標註網址：https://rad-tech01-student.rad-report-relay.workers.dev/teacher/

教師密碼（可分享給負責標註的老師）：${teacher}
管理者密碼（請自行保管，不要分享）：${admin}

兩種密碼都在同一個入口登入。教師可畫箭頭、儲存草稿；只有管理者可發布與復原。
請勿把整份檔案傳給其他老師。只提供教師密碼與網址，不要放在公開文件。
`,{mode:0o600,flag:'wx'});
