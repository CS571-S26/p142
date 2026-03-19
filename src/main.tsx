import { createRoot } from 'react-dom/client'
import "bootstrap/dist/css/bootstrap.min.css"
import App from './components/structural/App.tsx'

createRoot(document.getElementById('root')!).render(
    <App />
)
