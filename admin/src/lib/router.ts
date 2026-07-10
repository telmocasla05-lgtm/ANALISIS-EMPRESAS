// Enrutado por hash (#/dashboard, #/gestion/empleados, #/sesiones): sin
// dependencias y con URLs compartibles dentro del panel.
import { useEffect, useState } from 'react';

const DEFAULT_ROUTE = '/dashboard';

function currentRoute(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || DEFAULT_ROUTE;
}

export function useHashRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = (to: string) => {
    window.location.hash = to;
  };
  return [route, navigate];
}
