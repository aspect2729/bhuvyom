declare module '*.geojson' {
  const value: {
    type?: string;
    features?: { geometry: { type: string; coordinates: number[][][] } }[];
    geometry?: { type: string; coordinates: number[][][] };
  };
  export default value;
}

declare module '*.json' {
  const value: unknown;
  export default value;
}
