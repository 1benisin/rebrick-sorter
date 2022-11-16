import { Server } from 'socket.io';

const SocketHandler = (req, res) => {
  // if socket is already connected, return
  if (res.socket.server.io) {
    console.log('Socket is already running');
    res.end();
    return;
  }

  console.log('Socket is initializing');
  const io = new Server(res.socket.server);
  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log('Socket is Connected');

    socket.on('client-message', (msg) => {
      console.log('RECIEVED', msg);
      io.emit('server-message', msg);
    });

    socket.on('test', (msg) => console.log('test'));
  });

  res.end();
};

export default SocketHandler;
