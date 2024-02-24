'use client';

import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

let socket;

const Test = () => {
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [allMessages, setAllMessages] = useState([]);

  useEffect(() => {
    socketInitializer();

    return () => {
      socket.disconnect();
    };
  }, []);

  async function socketInitializer() {
    // const res = await fetch('/api/socket');
    // console.log('res from api/socket', res);

    // socket = io();
    socket = io('http://localhost:3002');

    socket.on('receive-message', (data) => {
      setAllMessages((pre) => [...pre, data]);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    console.log('emitted', message, username);

    socket.emit('send-message', {
      username,
      message,
    });
    setMessage('');
  }

  return (
    <div>
      <h1>Chat app</h1>
      <h1>Enter a username</h1>

      <input value={username} onChange={(e) => setUsername(e.target.value)} />

      <br />
      <br />

      <div>
        {allMessages.map(({ username, message }, index) => (
          <div key={index}>
            {username}: {message}
          </div>
        ))}

        <br />

        <form onSubmit={handleSubmit}>
          <input name="message" placeholder="enter your message" value={message} onChange={(e) => setMessage(e.target.value)} autoComplete={'off'} />
        </form>
      </div>
    </div>
  );
};

export default Test;
