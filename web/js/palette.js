/*
 * 背景地図の配色。トイレマーカーを主役に保つため、地物は低彩度に抑える。
 */
(function (global) {
  'use strict';

  global.TMPalette = {
    light: {
      land: '#e6eae4',
      terrain: '#d8dfd3',
      water: '#acd7e8',
      waterLine: '#6faec6',
      adminPref: '#7e8b91',
      adminCity: '#b4bebc',
      building: '#c5ccc4',
      buildingLine: '#aab4aa',
      roadExpwy: '#e58b5b',
      roadExpwyCase: '#ae5d3b',
      roadNational: '#f0c36f',
      roadNationalCase: '#c68d3f',
      roadPref: '#fffdf8',
      roadPrefCase: '#aeb8ae',
      roadLocal: '#ffffff',
      roadLocalCase: '#bec7bd',
      roadTunnel: '#9b8580',
      railCase: '#6d7880',
      railDash: '#f7f6f2',
      label: '#243746',
      labelRail: '#4b5c67',
      labelWater: '#3c6b7d',
      labelTerrain: '#56644c',
      labelHalo: '#ffffff'
    },
    dark: {
      land: '#1c2528',
      terrain: '#2a3730',
      water: '#24586d',
      waterLine: '#5d9bb3',
      adminPref: '#8b999b',
      adminCity: '#53635f',
      building: '#404b46',
      buildingLine: '#5b6760',
      roadExpwy: '#d27a50',
      roadExpwyCase: '#7f442f',
      roadNational: '#cda35d',
      roadNationalCase: '#806231',
      roadPref: '#a9b3aa',
      roadPrefCase: '#4c5a53',
      roadLocal: '#79847d',
      roadLocalCase: '#35413c',
      roadTunnel: '#a68f8d',
      railCase: '#9bacb4',
      railDash: '#dce8ed',
      label: '#e5edf0',
      labelRail: '#c3d6df',
      labelWater: '#a9dce9',
      labelTerrain: '#c2d4a2',
      labelHalo: '#142027'
    }
  };
})(window);
