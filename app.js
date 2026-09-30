import 'dotenv/config';
import { app } from './server/index.js';

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on ${port}`));
