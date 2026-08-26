import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import MountainPickerApp from '../app/mountain-picker-app';

const root = document.getElementById('root');

if (!root) throw new Error('Missing application root');

createRoot(root).render(
  <StrictMode>
    <MountainPickerApp
      displayName=""
      deploymentMode="public"
      basePath="/mountain"
      weatherEndpoint="/mountain/api/weather"
    />
  </StrictMode>,
);
