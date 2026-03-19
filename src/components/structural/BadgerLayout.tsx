import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";
import { Link } from "react-router";

import react from '../../assets/react.svg'

function BadgerLayout(props: { chatrooms: string[] }) {


    let chatroom = props.chatrooms

    return (
        <div>
            <Navbar bg="dark" variant="dark">
                <Container>
                    <Navbar.Brand as={Link} to="/">
                        <img
                            alt="BadgerChat Logo"
                            src={react}
                            width="30"
                            height="30"
                            className="d-inline-block align-top"
                        />{' '}
                        BadgerChat
                    </Navbar.Brand>
                    <Nav className="me-auto">
                        <Nav.Link as={Link} to="/">Home</Nav.Link>                       
                        <NavDropdown title="Chatrooms">
                            {
                                chatroom.map((c) => {
                                    return <NavDropdown.Item as={Link} to={`chatrooms/${c}`} key ={c}>
                                        <p>{c}</p>
                                    </NavDropdown.Item>
                                })
                            }
                        </NavDropdown>
                    </Nav>
                </Container>
            </Navbar>
            <div style={{ margin: "1rem" }}>
                    <p>TEST</p>
            </div>
        </div>
    );
}

export default BadgerLayout;