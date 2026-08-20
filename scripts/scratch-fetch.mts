import * as dotenv from 'dotenv';
dotenv.config();
fetch('http://localhost:3001/api/bot/menu', {
  headers: {
    Authorization: 'Bearer ' + process.env.INTERNAL_API_KEY
  }
})
.then(r => r.json())
.then(j => console.log(JSON.stringify(j, null, 2)))
.catch(e => console.error(e));
