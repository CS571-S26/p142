import { useState } from 'react'
import { useEffect } from 'react';

import { HashRouter, Route, Routes } from 'react-router-dom';

import BadgerLayout from './BadgerLayout';



function App() {

  const [chatrooms, setChatrooms] = useState([]);

  useEffect(() => {
    fetch('https://cs571api.cs.wisc.edu/rest/s26/hw6/chatrooms', {
      headers: {
        "X-CS571-ID": "bid_c33a2ef743d38f2c4e553d46a32e34c7aaba096fcb6da9f763e983ec869b3caf",
      }
    }).then(res => res.json()).then(json => {
      setChatrooms(json)
    })
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<BadgerLayout chatrooms={chatrooms} />}>
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App
