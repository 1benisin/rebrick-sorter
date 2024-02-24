const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const nextApp = next({ dev: true });
const nextHandler = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    nextHandler(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: 'http://localhost:3000', // Allow only your client's origin or use "*" to allow all origins
      methods: ['GET', 'POST'], // Specify allowed request methods
      allowedHeaders: ['my-custom-header'], // Specify allowed headers
      credentials: true, // Allow credentials (cookies, authorization headers, etc.) to be sent with requests
    },
  });
  io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });

    socket.on('data', (data) => {
      console.log('data recieved', data);
    });

    socket.on('send-message', (data) => {
      console.log('message recieved', data);
      socket.broadcast.emit('receive-message', data);
    });
  });

  server.listen(3002, () => {
    console.log('> Ready on http://localhost:3002');
  });
});
