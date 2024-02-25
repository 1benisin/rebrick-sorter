'use client';
import React, { useState } from 'react';
import { useSocket } from '@/components/providers/socketProvider';

const Home = () => {
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [allMessages, setAllMessages] = useState([]);

  const { socket } = useSocket();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!socket) return;

    console.log('emitted');

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

export default Home;
