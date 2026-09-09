import express from 'express';
import 'dotenv/config';
import main from './src/utils/queryRAG.js';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';




const app = express();
const PORT = process.env.PORT || 3000;



const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://hrms.prathtech.com',
  }
});

io.on('connection', (socket) => {
  // console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    // console.log('A user disconnected:', socket.id);
  });
});


app.use(cors({
    origin: 'https://hrms.prathtech.com', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, World!');
});
app.post('/chat', async(req, res) => {
    console.log('Received request:', req.body.prompt);
  const result = await main(req.body.prompt); 
  console.log('Sending response:', result);
  res.json({ result });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});