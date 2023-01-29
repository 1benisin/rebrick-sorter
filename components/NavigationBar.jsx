import { Nav, Navbar, NavItem, NavLink } from 'react-bootstrap';
import styled from 'styled-components';
import AuthButton from '../components/AuthButton';

function NavigationBar({ children }) {
  return (
    <>
      <header>
        <NavbarStyled>
          <Navbar.Brand href="/">Rebrick Cataloger</Navbar.Brand>
          <Nav>
            {/* <Nav.Item> */}
            {/* <Nav.Link href="/search/">Search</Nav.Link> */}
            <Nav.Link href="/video/">Video</Nav.Link>
            {/* </Nav.Item> */}
          </Nav>
          <AuthButton />
        </NavbarStyled>
      </header>
      {children}
    </>
  );
}

export default NavigationBar;

const NavbarStyled = styled(Navbar)`
  display: flex;
  justify-content: space-between;
`;
