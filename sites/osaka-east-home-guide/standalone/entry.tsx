import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import CityTowerFurukawabashi from "../app/properties/city-tower-furukawabashi/page";
import "../app/globals.css";
import "../app/resolution.css";
import "../app/properties/city-tower-furukawabashi/property.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Offline page root element is missing.");
}

const isCityTowerDetail = window.location.pathname.includes("/properties/city-tower-furukawabashi/");

createRoot(root).render(
  <React.StrictMode>
    {isCityTowerDetail ? <CityTowerFurukawabashi /> : <Home />}
  </React.StrictMode>,
);
