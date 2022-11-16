import io from 'socket.io-client';
let socket = null;

export const emitTest = (value) => {
  console.log('emitting', value);
  socket.emit('client-message', value);
  // socket.emit('test', value);
};

export const socketInitializer = async () => {
  if (socket) return; // if socket is already initialized, return
  socket = 'initializing';
  await fetch('/api/socket');
  socket = io();

  socket.on('connect', () => console.log('Socket Connected'));

  socket.on('server-message', (msg) => console.log('RECIEVED', msg));
};
