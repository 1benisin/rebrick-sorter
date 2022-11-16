import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import styled from 'styled-components';
import { Stack, Form, Button, Alert } from 'react-bootstrap';

import { useAuth } from '../components/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const router = useRouter();
  const { logIn } = useAuth();

  const onSubmit = (event) => {
    event.preventDefault();
    setError(null);
    logIn(email, password)
      .then(() => {
        router.push('/');
      })
      .catch((error) => {
        setError(error.message);
      });
  };

  return (
    <>
      <Column>
        <h2>Login</h2>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form onSubmit={onSubmit}>
          <Stack gap={3}>
            <Form.Control
              type="email"
              placeholder="Email"
              onChange={(event) => setEmail(event.target.value)}
            />
            <Form.Control
              type="password"
              placeholder="Password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button variant="primary" type="submit">
              Login
            </Button>
            <Form.Text>
              No account? <Link href="/signup">Create one</Link>
            </Form.Text>
          </Stack>
        </Form>
      </Column>
    </>
  );
}

const Column = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 350px;
  margin: auto;
  text-align: center;
  padding: 20px;
`;
