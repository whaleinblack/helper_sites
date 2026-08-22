import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import CityTowerFurukawabashi from "../app/properties/city-tower-furukawabashi/page";
import ScenesSekimeTakadono from "../app/properties/scenes-sekime-takadono/page";
import WellithDainichi from "../app/properties/wellith-dainichi/page";
import "../app/globals.css";
import "../app/resolution.css";
import "../app/properties/city-tower-furukawabashi/property.css";
import "../app/properties/showcase.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Offline page root element is missing.");
}

const isCityTowerDetail = window.location.pathname.includes("/properties/city-tower-furukawabashi/");
const isScenesDetail = window.location.pathname.includes("/properties/scenes-sekime-takadono/");
const isWellithDetail = window.location.pathname.includes("/properties/wellith-dainichi/");

createRoot(root).render(
  <React.StrictMode>
    {isCityTowerDetail ? <CityTowerFurukawabashi /> : isScenesDetail ? <ScenesSekimeTakadono /> : isWellithDetail ? <WellithDainichi /> : <Home />}
  </React.StrictMode>,
);
