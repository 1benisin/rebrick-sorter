import { useRouter } from 'next/router';
import styled from 'styled-components';
import { Button } from 'react-bootstrap';
import { useAuth } from './AuthContext';

export default function AuthButton(props) {
  const { user, logOut } = useAuth();
  const router = useRouter();

  const handleClick = (e) => {
    // e.preventDefault();
    user.uid ? logOut() : router.push('/login/');
  };

  return (
    <Container>
      <ButtonStyled onClick={handleClick} size="sm" {...props}>
        {user.uid ? 'Sign Out' : 'Sign In'}
      </ButtonStyled>
      <Username>{user.uid ? user.email : null} </Username>
    </Container>
  );
}

const ButtonStyled = styled(Button)`
  margin: auto 5px;
`;
const Container = styled.div`
  display: flex;
`;

const Username = styled.p`
  margin: auto;
  font-size: small;
  color: grey;
`;
