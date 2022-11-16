import { useRouter } from 'next/router';
import Link from 'next/link';
import { useState } from 'react';
import styled from 'styled-components';
import { Stack, Form, Button, Alert } from 'react-bootstrap';

import { useAuth } from '../components/AuthContext';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [passwordOne, setPasswordOne] = useState('');
  const [passwordTwo, setPasswordTwo] = useState('');
  const router = useRouter();
  const [error, setError] = useState(null);

  const { signUp } = useAuth();

  const onSubmit = (event) => {
    event.preventDefault();
    setError(null);
    if (passwordOne === passwordTwo)
      signUp(email, passwordOne)
        .then(() => {
          console.log('Success. The user is created in firebase');
          router.push('/');
        })
        .catch((error) => {
          setError(error.message);
        });
    else setError('Password do not match');
  };

  return (
    <>
      <Column>
        <h2>Sign Up</h2>
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
              onChange={(event) => setPasswordOne(event.target.value)}
            />
            <Form.Control
              type="password"
              placeholder="Confirm Password"
              onChange={(event) => setPasswordTwo(event.target.value)}
            />
            <Button variant="primary" type="submit">
              Sign up
            </Button>
            <Form.Text>
              Have account? <Link href="/login">Login</Link>
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
