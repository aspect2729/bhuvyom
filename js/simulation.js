// =========================================================================
// SIMULATION — real data, one visual language per layer
//   Live field   : Open-Meteo forecast + air-quality APIs on a 99-point grid over Karnataka
//   Record       : ERA5 reanalysis (Open-Meteo archive), Bengaluru annual values 1980–2025
//   Projection   : IPCC AR6 WGI Table SPM.1 central global-warming estimates per SSP,
//                  added to Bengaluru's observed 2016–2025 mean (temperature layers only)
//   Boundary     : geoBoundaries IND ADM1 (DataMeet / ECI, CC BY 2.5 IN), simplified
//   Visuals      : air temp = thermal field + flowing isotherms · surface = thermal dot matrix + scan
//                  rain = live clouds + rain where the last 30 days' rain fell · humidity = mist
//                  wind = particles on the live wind vectors · PM2.5 = haze + drifting particulates
// =========================================================================
(function () {
  'use strict';
  if (!document.getElementById('terra-sim-engine')) return;

  // ─── CONTEXT FOR THE DETAIL BLOCK ───
  const SYSTEMS = {
    temp:   { n: '01', name: 'Temperature', desc: 'How warm the air and the ground get, and how that is shifting decade by decade.',
              vars: ['Air temperature','Land surface temperature','Sea surface temperature','Temperature anomalies','Temperature trends','Urban heat islands'] },
    precip: { n: '02', name: 'Precipitation & Water', desc: 'Southwest-monsoon rain, where it falls across the Ghats and plateau, and what it leaves behind in soil and lakes.',
              vars: ['Rainfall','Snowfall','Rainfall intensity','Soil moisture','Groundwater','River discharge','Evapotranspiration','Runoff','Flood extent','Water availability'] },
    atmos:  { n: '04', name: 'Atmospheric Activity', desc: 'Moisture, wind and pressure over the Deccan plateau — the conditions that move heat and pollution around.',
              vars: ['Atmospheric pressure','Humidity','Wind speed and direction','Cloud cover','Water vapour','Jet streams','Atmospheric circulation','Aerosols','Atmospheric rivers'] },
    chem:   { n: '11', name: 'Atmospheric Chemistry & Air Quality', desc: 'Fine particulates and trace gases from traffic, industry and burning, modelled by Copernicus CAMS.',
              vars: ['Carbon dioxide','Methane','Carbon monoxide','Nitrogen dioxide','Sulphur dioxide','Ozone','PM2.5','PM10','Aerosol concentration','Greenhouse gas concentrations'] }
  };

  // ─── LAYERS (all real) ───
  const WARM = [[0,[24,40,90]],[0.3,[91,140,255]],[0.55,[127,224,240]],[0.8,[224,144,90]],[1,[244,194,124]]];
  const LAYERS = [
    { key:'air',  label:'Air temperature',          unit:'°C',    dec:1, lo:14, hi:38,  sys:'temp',   tag:'Air temperature', fieldA: 0.62,
      src:'2 m above ground · ECMWF / GFS', hist:'temperature_2m_mean', agg:'mean', proj:'record', stops:WARM },
    { key:'surf', label:'Ground surface temperature', unit:'°C',  dec:1, lo:14, hi:46,  sys:'temp',   tag:'Land surface temperature', fieldA: 0,
      src:'Soil skin, 0 cm · ECMWF / GFS', hist:null, proj:'live',
      stops:[[0,[40,30,70]],[0.35,[154,134,184]],[0.7,[224,144,90]],[1,[250,214,150]]] },
    { key:'rain', label:'Rainfall · last 30 days',  unit:'mm',    dec:0, lo:0,  hi:300, sys:'precip', tag:'Rainfall', fieldA: 0.34,
      src:'Daily totals summed · ECMWF / GFS', hist:'precipitation_sum', agg:'sum', proj:null,
      stops:[[0,[10,14,30]],[0.25,[47,107,255]],[0.65,[127,224,240]],[1,[230,250,255]]] },
    { key:'rh',   label:'Relative humidity',        unit:'%',     dec:0, lo:20, hi:100, sys:'atmos',  tag:'Humidity', fieldA: 0.22,
      src:'2 m above ground · ECMWF / GFS', hist:'relative_humidity_2m_mean', agg:'mean', proj:null,
      stops:[[0,[40,30,60]],[0.5,[95,196,216]],[1,[200,214,255]]] },
    { key:'wind', label:'Wind speed',               unit:'m/s',   dec:1, lo:0,  hi:9,   sys:'atmos',  tag:'Wind speed and direction', fieldA: 0.14,
      src:'10 m above ground · ECMWF / GFS', hist:'wind_speed_10m_mean', agg:'mean', proj:null,
      stops:[[0,[60,70,140]],[0.4,[127,224,240]],[0.75,[200,240,255]],[1,[255,255,255]]] },
    { key:'pm25', label:'PM2.5 air pollution',      unit:'µg/m³', dec:0, lo:0,  hi:100, sys:'chem',   tag:'PM2.5', fieldA: 0.28,
      src:'Fine particulates · Copernicus CAMS', hist:null, proj:null,
      stops:[[0,[20,40,60]],[0.25,[95,196,216]],[0.55,[154,134,184]],[0.8,[224,144,90]],[1,[244,120,90]]] }
  ];
  const FX_NOTE = {
    air:  s => `Colour: temperature · lines every ${s} °C`,
    surf: () => 'Dot size and colour: ground temperature',
    rain: () => 'Clouds: live cover now, darker where the last 30 days were wettest',
    rh:   () => 'Mist thickens as humidity rises',
    wind: () => 'Streaks flow with the live wind, coloured by speed',
    pm25: () => 'Haze and particles thicken with PM2.5, drifting on the wind'
  };

  // IPCC AR6 WGI SPM Table SPM.1 — global warming vs 1850–1900, central (°C); 2100 extends the 2050→2090 slope
  const AR6 = { ssp126: [[2020.5,1.2],[2030,1.5],[2050,1.7],[2090,1.8],[2100,1.825]],
                ssp245: [[2020.5,1.2],[2030,1.5],[2050,2.0],[2090,2.7],[2100,2.875]],
                ssp585: [[2020.5,1.2],[2030,1.6],[2050,2.4],[2090,4.4],[2100,4.9]] };
  const SCEN = { ssp126: 'Low emissions (SSP1-2.6)', ssp245: 'Middle road (SSP2-4.5)', ssp585: 'High emissions (SSP5-8.5)' };
  const NOW_YEAR = 2026, REC_END = 2025;

  const BLR = [12.9716, 77.5946];

  // Karnataka state boundary (lat, lon) — geoBoundaries IND ADM1, Douglas–Peucker simplified (ε 0.012°)
  const KA_OUTLINE = [[15.652,74.118],[15.654,74.164],[15.682,74.182],[15.651,74.205],[15.669,74.224],[15.657,74.251],[15.626,74.244],[15.616,74.264],[15.567,74.245],[15.531,74.283],[15.492,74.251],[15.449,74.276],[15.392,74.276],[15.368,74.323],[15.329,74.317],[15.295,74.336],[15.283,74.276],[15.259,74.251],[15.224,74.302],[15.184,74.317],[15.149,74.285],[15.098,74.273],[15.041,74.297],[14.998,74.254],[14.959,74.252],[14.967,74.237],[14.925,74.201],[14.958,74.163],[14.912,74.162],[14.925,74.124],[14.901,74.086],[14.841,74.125],[14.806,74.125],[14.804,74.093],[14.719,74.205],[14.737,74.205],[14.748,74.234],[14.719,74.263],[14.646,74.286],[14.627,74.270],[14.546,74.315],[14.521,74.310],[14.509,74.355],[14.419,74.395],[13.987,74.515],[13.948,74.549],[13.949,74.569],[13.867,74.610],[13.635,74.670],[13.347,74.698],[12.795,74.847],[12.754,74.882],[12.792,75.003],[12.768,75.009],[12.738,74.982],[12.728,75.011],[12.715,75.001],[12.719,75.050],[12.667,75.047],[12.674,75.085],[12.705,75.085],[12.681,75.112],[12.682,75.152],[12.645,75.138],[12.621,75.161],[12.629,75.202],[12.589,75.200],[12.568,75.220],[12.620,75.276],[12.594,75.326],[12.574,75.315],[12.584,75.290],[12.570,75.272],[12.537,75.273],[12.500,75.332],[12.464,75.336],[12.465,75.360],[12.502,75.382],[12.499,75.417],[12.459,75.413],[12.457,75.366],[12.400,75.372],[12.373,75.422],[12.347,75.410],[12.309,75.432],[12.288,75.415],[12.290,75.485],[12.216,75.540],[12.200,75.533],[12.147,75.592],[12.148,75.636],[12.099,75.662],[12.108,75.703],[12.071,75.715],[12.080,75.803],[12.037,75.801],[11.952,75.870],[11.931,76.003],[11.979,76.112],[11.850,76.120],[11.871,76.190],[11.808,76.224],[11.812,76.280],[11.739,76.340],[11.759,76.414],[11.726,76.427],[11.712,76.404],[11.673,76.416],[11.664,76.458],[11.705,76.512],[11.674,76.551],[11.623,76.560],[11.608,76.614],[11.619,76.757],[11.599,76.856],[11.656,76.835],[11.734,76.888],[11.777,76.897],[11.795,76.908],[11.777,76.970],[11.812,76.982],[11.805,77.030],[11.770,77.035],[11.788,77.067],[11.770,77.056],[11.736,77.080],[11.721,77.118],[11.774,77.111],[11.795,77.239],[11.813,77.250],[11.809,77.294],[11.771,77.335],[11.788,77.394],[11.761,77.427],[11.847,77.467],[11.900,77.462],[11.888,77.486],[11.943,77.494],[11.932,77.538],[11.952,77.676],[12.036,77.709],[12.114,77.777],[12.182,77.728],[12.206,77.611],[12.195,77.519],[12.208,77.472],[12.271,77.479],[12.291,77.551],[12.368,77.617],[12.488,77.635],[12.479,77.584],[12.509,77.616],[12.515,77.587],[12.552,77.580],[12.629,77.606],[12.667,77.599],[12.684,77.660],[12.660,77.679],[12.661,77.704],[12.683,77.712],[12.673,77.740],[12.698,77.737],[12.701,77.765],[12.737,77.763],[12.747,77.792],[12.768,77.779],[12.797,77.809],[12.832,77.810],[12.842,77.792],[12.870,77.836],[12.870,77.890],[12.891,77.929],[12.872,77.942],[12.828,77.921],[12.823,77.941],[12.857,77.952],[12.808,77.989],[12.806,78.010],[12.857,78.024],[12.854,78.053],[12.782,78.134],[12.761,78.231],[12.861,78.252],[12.859,78.312],[12.941,78.356],[12.907,78.389],[12.912,78.446],[12.867,78.465],[12.905,78.467],[12.929,78.438],[12.922,78.419],[12.945,78.411],[12.981,78.435],[12.975,78.467],[13.043,78.462],[13.062,78.514],[13.092,78.509],[13.106,78.538],[13.132,78.517],[13.167,78.580],[13.200,78.550],[13.213,78.579],[13.221,78.566],[13.281,78.587],[13.312,78.566],[13.267,78.532],[13.301,78.479],[13.321,78.483],[13.308,78.444],[13.328,78.440],[13.316,78.401],[13.332,78.377],[13.346,78.408],[13.362,78.365],[13.397,78.382],[13.509,78.374],[13.587,78.402],[13.583,78.259],[13.599,78.236],[13.565,78.193],[13.628,78.204],[13.633,78.168],[13.656,78.168],[13.643,78.087],[13.676,78.066],[13.698,78.069],[13.693,78.113],[13.716,78.121],[13.742,78.092],[13.786,78.126],[13.863,78.115],[13.861,78.082],[13.896,78.049],[13.862,78.046],[13.873,78.000],[13.830,77.976],[13.827,77.953],[13.886,77.949],[13.898,77.984],[13.956,77.988],[13.960,77.967],[13.905,77.927],[13.920,77.896],[13.941,77.896],[13.945,77.827],[13.915,77.813],[13.870,77.837],[13.844,77.782],[13.818,77.782],[13.800,77.719],[13.741,77.717],[13.770,77.703],[13.761,77.672],[13.787,77.680],[13.784,77.651],[13.762,77.618],[13.747,77.642],[13.735,77.628],[13.751,77.600],[13.722,77.561],[13.753,77.547],[13.754,77.527],[13.693,77.528],[13.715,77.485],[13.690,77.492],[13.682,77.455],[13.806,77.465],[13.799,77.423],[13.843,77.433],[13.854,77.362],[13.833,77.325],[13.867,77.311],[13.847,77.257],[13.904,77.236],[13.863,77.200],[13.870,77.181],[13.925,77.185],[13.907,77.162],[13.865,77.169],[13.856,77.128],[13.830,77.169],[13.806,77.158],[13.783,77.179],[13.762,77.173],[13.767,77.090],[13.742,77.086],[13.744,77.065],[13.779,77.024],[13.739,77.017],[13.748,76.997],[13.817,76.976],[13.860,77.014],[13.903,77.023],[13.907,77.047],[13.933,77.042],[13.963,76.994],[13.990,77.000],[14.030,76.931],[14.054,76.932],[14.071,76.978],[14.137,76.925],[14.138,76.886],[14.168,76.895],[14.173,76.942],[14.198,76.948],[14.182,76.961],[14.177,77.023],[14.062,77.028],[14.047,77.127],[14.001,77.149],[14.012,77.245],[14.035,77.270],[14.011,77.275],[14.030,77.322],[13.995,77.336],[13.991,77.361],[13.958,77.349],[13.953,77.371],[13.904,77.354],[13.907,77.398],[13.888,77.399],[13.899,77.421],[13.920,77.435],[13.946,77.412],[13.948,77.435],[13.976,77.438],[13.976,77.382],[14.017,77.390],[14.031,77.332],[14.119,77.401],[14.104,77.347],[14.130,77.351],[14.136,77.379],[14.174,77.394],[14.157,77.504],[14.184,77.517],[14.231,77.493],[14.279,77.498],[14.292,77.479],[14.281,77.450],[14.318,77.446],[14.336,77.393],[14.305,77.377],[14.212,77.419],[14.199,77.392],[14.234,77.359],[14.276,77.364],[14.283,77.284],[14.340,77.287],[14.317,77.238],[14.342,77.157],[14.337,77.136],[14.293,77.116],[14.220,77.108],[14.214,77.081],[14.246,77.052],[14.245,76.940],[14.274,76.925],[14.294,76.957],[14.348,76.885],[14.396,76.885],[14.421,76.916],[14.400,76.943],[14.451,76.945],[14.485,76.975],[14.474,76.868],[14.510,76.856],[14.531,76.806],[14.602,76.765],[14.742,76.803],[14.786,76.783],[14.791,76.837],[14.811,76.837],[14.809,76.854],[14.889,76.846],[14.896,76.864],[14.970,76.867],[14.956,76.829],[14.990,76.761],[15.008,76.787],[15.072,76.775],[15.096,76.800],[15.060,76.866],[15.030,76.877],[15.015,76.985],[15.034,77.004],[15.033,77.050],[15.010,77.044],[15.005,77.069],[15.031,77.085],[15.034,77.113],[15.101,77.130],[15.123,77.156],[15.140,77.157],[15.148,77.135],[15.171,77.169],[15.240,77.126],[15.269,77.167],[15.273,77.147],[15.292,77.152],[15.295,77.118],[15.334,77.113],[15.328,77.064],[15.436,77.032],[15.498,76.974],[15.511,76.975],[15.503,77.030],[15.635,77.030],[15.659,77.083],[15.631,77.121],[15.666,77.129],[15.695,77.079],[15.728,77.080],[15.730,77.049],[15.827,77.066],[15.838,77.025],[15.909,77.071],[15.957,77.185],[15.949,77.430],[15.927,77.513],[16.008,77.514],[16.037,77.494],[16.080,77.507],[16.086,77.494],[16.108,77.513],[16.120,77.490],[16.163,77.486],[16.228,77.516],[16.229,77.492],[16.255,77.490],[16.276,77.505],[16.267,77.537],[16.302,77.563],[16.293,77.598],[16.344,77.593],[16.385,77.490],[16.366,77.421],[16.384,77.349],[16.409,77.288],[16.473,77.236],[16.477,77.294],[16.496,77.299],[16.489,77.369],[16.514,77.378],[16.522,77.419],[16.549,77.419],[16.570,77.393],[16.569,77.424],[16.599,77.467],[16.617,77.454],[16.650,77.476],[16.641,77.434],[16.669,77.419],[16.687,77.470],[16.717,77.474],[16.723,77.426],[16.789,77.440],[16.788,77.477],[16.914,77.454],[16.919,77.469],[16.996,77.480],[17.014,77.503],[17.110,77.464],[17.159,77.364],[17.196,77.372],[17.210,77.404],[17.223,77.380],[17.279,77.459],[17.292,77.438],[17.374,77.454],[17.355,77.484],[17.371,77.530],[17.406,77.538],[17.431,77.513],[17.444,77.537],[17.431,77.576],[17.456,77.576],[17.446,77.614],[17.473,77.615],[17.478,77.645],[17.507,77.657],[17.483,77.652],[17.478,77.671],[17.475,77.688],[17.499,77.693],[17.534,77.597],[17.565,77.594],[17.552,77.551],[17.575,77.528],[17.542,77.507],[17.568,77.494],[17.584,77.443],[17.695,77.452],[17.749,77.569],[17.766,77.569],[17.786,77.507],[17.828,77.528],[17.820,77.554],[17.875,77.576],[17.873,77.599],[17.908,77.586],[17.904,77.619],[17.960,77.625],[17.950,77.650],[17.968,77.656],[17.999,77.649],[18.012,77.590],[18.056,77.548],[18.087,77.597],[18.156,77.597],[18.196,77.564],[18.220,77.585],[18.244,77.572],[18.281,77.605],[18.310,77.513],[18.282,77.512],[18.263,77.465],[18.310,77.438],[18.307,77.366],[18.320,77.357],[18.347,77.400],[18.393,77.414],[18.401,77.373],[18.452,77.366],[18.434,77.345],[18.458,77.320],[18.442,77.317],[18.413,77.242],[18.371,77.246],[18.315,77.199],[18.280,77.213],[18.285,77.175],[18.217,77.152],[18.197,77.098],[18.156,77.112],[18.151,77.064],[18.182,77.033],[18.159,77.023],[18.161,77.001],[18.190,76.991],[18.188,76.952],[18.118,76.921],[18.098,76.966],[18.083,76.945],[18.040,76.952],[18.035,76.914],[18.010,76.906],[17.916,76.919],[17.894,76.884],[17.899,76.840],[17.871,76.807],[17.878,76.775],[17.901,76.768],[17.900,76.740],[17.857,76.739],[17.826,76.790],[17.787,76.762],[17.781,76.714],[17.738,76.728],[17.727,76.700],[17.681,76.691],[17.688,76.664],[17.770,76.615],[17.706,76.582],[17.761,76.573],[17.760,76.523],[17.715,76.524],[17.715,76.487],[17.660,76.490],[17.645,76.429],[17.604,76.420],[17.597,76.331],[17.542,76.341],[17.519,76.367],[17.493,76.346],[17.490,76.376],[17.470,76.331],[17.434,76.333],[17.436,76.372],[17.378,76.363],[17.371,76.409],[17.315,76.383],[17.314,76.354],[17.354,76.345],[17.348,76.314],[17.332,76.318],[17.335,76.276],[17.361,76.272],[17.379,76.243],[17.353,76.170],[17.301,76.176],[17.345,76.163],[17.371,76.119],[17.332,76.079],[17.355,76.061],[17.354,76.014],[17.323,75.931],[17.357,75.891],[17.418,75.884],[17.386,75.861],[17.421,75.822],[17.373,75.814],[17.370,75.793],[17.420,75.734],[17.409,75.691],[17.456,75.676],[17.477,75.633],[17.420,75.607],[17.392,75.614],[17.383,75.574],[17.351,75.581],[17.345,75.610],[17.306,75.604],[17.263,75.658],[17.215,75.662],[17.174,75.625],[17.116,75.650],[17.116,75.672],[17.065,75.677],[17.038,75.641],[17.038,75.670],[16.962,75.670],[16.971,75.608],[17.005,75.607],[17.010,75.573],[16.966,75.568],[16.969,75.529],[16.944,75.489],[16.988,75.466],[16.967,75.428],[16.980,75.392],[16.958,75.350],[16.957,75.280],[16.880,75.282],[16.842,75.214],[16.843,75.182],[16.875,75.189],[16.874,75.137],[16.913,75.118],[16.914,75.096],[16.952,75.089],[16.928,75.025],[16.944,75.027],[16.952,74.993],[16.948,74.964],[16.927,74.965],[16.945,74.932],[16.930,74.922],[16.910,74.964],[16.881,74.960],[16.863,74.902],[16.772,74.920],[16.773,74.850],[16.716,74.691],[16.677,74.690],[16.639,74.654],[16.607,74.687],[16.610,74.640],[16.578,74.629],[16.554,74.569],[16.565,74.555],[16.585,74.567],[16.595,74.544],[16.635,74.545],[16.630,74.489],[16.664,74.469],[16.647,74.455],[16.607,74.467],[16.583,74.397],[16.529,74.380],[16.560,74.356],[16.554,74.316],[16.504,74.306],[16.529,74.302],[16.525,74.283],[16.548,74.271],[16.504,74.278],[16.497,74.247],[16.480,74.261],[16.505,74.291],[16.463,74.289],[16.455,74.333],[16.401,74.335],[16.405,74.364],[16.366,74.353],[16.394,74.336],[16.381,74.317],[16.327,74.317],[16.298,74.343],[16.272,74.325],[16.275,74.351],[16.294,74.346],[16.262,74.373],[16.283,74.414],[16.258,74.418],[16.250,74.481],[16.192,74.507],[16.147,74.480],[16.090,74.483],[16.112,74.428],[16.054,74.361],[16.036,74.381],[16.059,74.430],[16.043,74.463],[15.957,74.431],[15.905,74.387],[15.855,74.406],[15.854,74.388],[15.894,74.369],[15.855,74.338],[15.849,74.383],[15.817,74.360],[15.786,74.368],[15.742,74.286],[15.755,74.268],[15.744,74.238],[15.787,74.234],[15.781,74.209],[15.759,74.202],[15.721,74.122],[15.681,74.126],[15.673,74.088]];
  const TOWNS_KA = [['BENGALURU',12.97,77.59],['MYSURU',12.30,76.64],['MANGALURU',12.87,74.84],['HUBBALLI',15.36,75.12],['BELAGAVI',15.85,74.50],
    ['KALABURAGI',17.33,76.83],['BALLARI',15.14,76.92],['VIJAYAPURA',16.83,75.71],['SHIVAMOGGA',13.93,75.57],['DAVANAGERE',14.46,75.92],
    ['TUMAKURU',13.34,77.10],['UDUPI',13.34,74.75],['KARWAR',14.81,74.13],['HASSAN',13.00,76.10],['CHIKKAMAGALURU',13.32,75.77],
    ['MADIKERI',12.42,75.74],['RAICHUR',16.20,77.36],['BIDAR',17.91,77.52],['HOSAPETE',15.27,76.39],['CHITRADURGA',14.23,76.40],
    ['KOLAR',13.14,78.13],['MANDYA',12.52,76.90],['BAGALKOT',16.18,75.70],['GADAG',15.43,75.63],['HAVERI',14.79,75.40],['SIRSI',14.62,74.84],
    ['CHAMARAJANAGAR',11.92,76.94],['YADGIR',16.77,77.14],['KOPPAL',15.35,76.15],['SAKLESHPUR',12.94,75.78],['AGUMBE',13.50,75.09]];
  // Bengaluru Urban district boundary — geoBoundaries IND ADM2 ("Bangalore"), simplified (ε 0.002°)
  const BLR_OUTLINE = [[12.9958,77.3276],[12.9480,77.3341],[12.9428,77.3397],[12.9398,77.3353],[12.9299,77.3351],[12.9292,77.3432],[12.9147,77.3428],[12.9099,77.3384],[12.8879,77.3462],[12.8869,77.3356],[12.8849,77.3357],[12.8789,77.3406],[12.8761,77.3492],[12.8686,77.3496],[12.8719,77.3676],[12.8645,77.3697],[12.8545,77.3790],[12.8629,77.3952],[12.8702,77.3980],[12.8649,77.4036],[12.8751,77.4095],[12.8768,77.4137],[12.8716,77.4205],[12.8780,77.4315],[12.8720,77.4321],[12.8695,77.4224],[12.8558,77.4302],[12.8508,77.4395],[12.8405,77.4392],[12.8359,77.4270],[12.8314,77.4233],[12.8269,77.4242],[12.8240,77.4386],[12.8174,77.4345],[12.8084,77.4458],[12.8191,77.4543],[12.8099,77.4673],[12.8088,77.4827],[12.8065,77.4809],[12.8001,77.4863],[12.7939,77.4726],[12.7799,77.4795],[12.7671,77.4756],[12.7550,77.4783],[12.7439,77.4910],[12.7366,77.5073],[12.7457,77.5169],[12.7448,77.5216],[12.7331,77.5223],[12.7556,77.5399],[12.7541,77.5460],[12.7644,77.5452],[12.7744,77.5532],[12.7767,77.5452],[12.7872,77.5519],[12.7996,77.5427],[12.8008,77.5598],[12.7894,77.5558],[12.7867,77.5647],[12.7810,77.5582],[12.7646,77.5644],[12.7598,77.5694],[12.7699,77.5751],[12.7806,77.5743],[12.7876,77.5837],[12.7832,77.5952],[12.7673,77.6007],[12.7571,77.5989],[12.7503,77.5896],[12.7539,77.5836],[12.7527,77.5784],[12.7342,77.5705],[12.7313,77.5600],[12.7226,77.5601],[12.7060,77.5650],[12.6998,77.5711],[12.7185,77.5980],[12.7067,77.6189],[12.6901,77.6063],[12.6759,77.6024],[12.6654,77.5957],[12.6582,77.5995],[12.6675,77.6006],[12.6842,77.6647],[12.6813,77.6807],[12.6744,77.6763],[12.6720,77.6797],[12.6607,77.6783],[12.6614,77.7060],[12.6684,77.7123],[12.6820,77.7160],[12.6805,77.7246],[12.6732,77.7259],[12.6722,77.7290],[12.6742,77.7420],[12.6821,77.7438],[12.6930,77.7378],[12.7017,77.7441],[12.6975,77.7608],[12.7142,77.7679],[12.7247,77.7736],[12.7286,77.7622],[12.7353,77.7636],[12.7395,77.7689],[12.7439,77.7887],[12.7484,77.7931],[12.7551,77.7955],[12.7613,77.7844],[12.7700,77.7821],[12.7915,77.7985],[12.7932,77.8084],[12.7971,77.8100],[12.8065,77.8019],[12.8160,77.8049],[12.8158,77.8112],[12.8220,77.8092],[12.8310,77.8115],[12.8338,77.7985],[12.8384,77.7940],[12.8440,77.7953],[12.8493,77.7999],[12.8480,77.8103],[12.8529,77.8154],[12.8531,77.8203],[12.8839,77.7938],[12.9042,77.7709],[12.9167,77.7355],[12.9333,77.7178],[12.9458,77.7272],[12.9489,77.7376],[12.9672,77.7381],[12.9791,77.7439],[12.9890,77.7407],[12.9978,77.7298],[13.0093,77.7246],[13.0472,77.7298],[13.0639,77.7132],[13.0743,77.7085],[13.0966,77.7123],[13.0907,77.7162],[13.0929,77.7236],[13.1113,77.7245],[13.1154,77.7352],[13.1229,77.7421],[13.1288,77.7383],[13.1405,77.7400],[13.1484,77.7325],[13.1604,77.7299],[13.1673,77.7319],[13.1719,77.7286],[13.1837,77.7323],[13.1888,77.7299],[13.1916,77.7158],[13.1878,77.7023],[13.1896,77.6972],[13.1971,77.6954],[13.1981,77.6911],[13.1930,77.6900],[13.1918,77.6776],[13.1858,77.6694],[13.1872,77.6591],[13.1888,77.6556],[13.2017,77.6544],[13.2058,77.6210],[13.2022,77.6079],[13.1905,77.6031],[13.1900,77.5995],[13.2020,77.5711],[13.2140,77.5708],[13.2153,77.5580],[13.2326,77.5600],[13.2324,77.5482],[13.2198,77.5373],[13.2193,77.5290],[13.2103,77.5225],[13.2250,77.5131],[13.2221,77.4805],[13.2152,77.4755],[13.2073,77.4742],[13.1961,77.4775],[13.1728,77.4689],[13.1635,77.4690],[13.1608,77.4625],[13.1649,77.4338],[13.1607,77.4322],[13.1554,77.4350],[13.1377,77.4202],[13.1393,77.4152],[13.1291,77.4119],[13.1290,77.4074],[13.1262,77.4064],[13.1140,77.4055],[13.1055,77.4203],[13.0871,77.4221],[13.0871,77.4274],[13.0689,77.4310],[13.0716,77.4030],[13.0657,77.3856],[13.0587,77.3847],[13.0523,77.3880],[13.0505,77.3903],[13.0559,77.3933],[13.0550,77.3993],[13.0294,77.3946],[13.0302,77.3794],[13.0198,77.3805],[13.0166,77.3741],[13.0095,77.3764],[12.9957,77.3429]];
  const PLACES_BLR = [['MAJESTIC',12.977,77.572],['SHIVAJINAGAR',12.985,77.605],['MALLESHWARAM',13.00,77.57],['RAJAJINAGAR',12.99,77.55],
    ['YESHWANTHPUR',13.02,77.54],['PEENYA',13.03,77.51],['HEBBAL',13.04,77.59],['YELAHANKA',13.10,77.60],['HESARAGHATTA',13.14,77.48],
    ['HENNUR',13.04,77.64],['BANASWADI',13.01,77.65],['KR PURAM',13.01,77.70],['INDIRANAGAR',12.97,77.64],['MARATHAHALLI',12.96,77.70],
    ['WHITEFIELD',12.97,77.75],['BELLANDUR',12.93,77.68],['SARJAPUR',12.86,77.78],['HSR LAYOUT',12.91,77.645],['KORAMANGALA',12.935,77.625],
    ['BTM LAYOUT',12.915,77.61],['JAYANAGAR',12.93,77.58],['BASAVANAGUDI',12.94,77.57],['JP NAGAR',12.91,77.585],['BANASHANKARI',12.92,77.55],
    ['VIJAYANAGAR',12.97,77.53],['KENGERI',12.91,77.48],['TALAGHATTAPURA',12.86,77.54],['BANNERGHATTA',12.80,77.58],['ELECTRONIC CITY',12.845,77.66],
    ['JIGANI',12.78,77.64],['ANEKAL',12.71,77.70]];

  // Everything that differs between the two views lives here; the rest of the engine is shared
  const REGIONS = {
    ka:  { key: 'ka',  name: 'Karnataka', bounds: { s: 11.5, n: 18.5, w: 74.0, e: 78.6 }, rows: 11, cols: 9, rw: 200, rh: 300,
           outline: KA_OUTLINE, places: TOWNS_KA, fxScale: 1, focal: 'BENGALURU', strip: 'Karnataka · 191,791 km²', minZoom: 5 },
    blr: { key: 'blr', name: 'Bengaluru', bounds: { s: 12.62, n: 13.27, w: 77.28, e: 77.87 }, rows: 9, cols: 9, rw: 220, rh: 242,
           outline: BLR_OUTLINE, places: PLACES_BLR, fxScale: 0.4, focal: 'BENGALURU · CITY CENTRE', strip: 'Bengaluru Urban district · 12.7–13.2° N', minZoom: 8 }
  };
  let REG, BOUNDS, GRID, BLR_IDX, KA, TOWNS;
  function setRegionData(k) {
    REG = REGIONS[k]; BOUNDS = REG.bounds; KA = REG.outline; TOWNS = REG.places;
    REG.di = (BOUNDS.n - BOUNDS.s) / (REG.rows - 1); REG.dj = (BOUNDS.e - BOUNDS.w) / (REG.cols - 1);
    GRID = [];
    for (let i = 0; i < REG.rows; i++) for (let j = 0; j < REG.cols; j++) GRID.push([+(BOUNDS.s + i * REG.di).toFixed(4), +(BOUNDS.w + j * REG.dj).toFixed(4)]);
    GRID.push(BLR); BLR_IDX = GRID.length - 1;
  }
  setRegionData('ka');

  // ─── STATE ───
  let layer = LAYERS[0];
  let year = NOW_YEAR, scenario = 'ssp245';
  let live = null, record = null, recordLoading = null;
  let raster = {};       // key -> Float32Array (NaN outside state)
  let full = {};         // unmasked rasters for weather effects: cloud, u, v
  let map = null, fieldOverlay = null, baseDay = null, baseNight = null, basemap = 'day';
  let hover = null, playTimer = null, st = null;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── DOM ───
  const $ = id => document.getElementById(id);
  const engine = $('terra-sim-engine'), tip = $('ts-tip'), veil = $('ts-veil'), veilText = $('ts-veil-text');
  const menuBtn = $('ts-menu-btn'), menuList = $('ts-menu-list'), liveEl = $('ts-live');
  const yearSlider = $('ts-tl-slider'), yearFill = $('ts-tl-fill'), yearDisplay = $('ts-tl-year'), playBtn = $('ts-tl-play'), scenEl = $('ts-scen');
  const PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#F2F2F2" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
  const PAUSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#F2F2F2" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>';

  // ─── HELPERS ───
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const rampAt = (t, stops) => {
    t = clamp01(t);
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
      const a = stops[i-1], b = stops[i], k = (t - a[0]) / ((b[0] - a[0]) || 1);
      return a[1].map((v, j) => Math.round(v + (b[1][j] - v) * k));
    }
    return stops[stops.length - 1][1];
  };
  const rampCss = stops => 'linear-gradient(90deg,' + stops.map(s => `rgb(${s[1].join(',')}) ${Math.round(s[0]*100)}%`).join(',') + ')';
  const fmt = (v, ly) => (v == null || isNaN(v)) ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: ly.dec, maximumFractionDigits: ly.dec }) + ' ' + ly.unit;
  const signed = (d, ly) => (d > 0.05 ? '+' : d < -0.05 ? '−' : '±') + Math.abs(d).toFixed(ly.dec || 1) + ' ' + ly.unit;
  const interp = (pts, x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i-1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    return pts[pts.length - 1][1];
  };
  const ar6 = (y, s) => interp(AR6[s], y);
  function inPoly(lat, lon) {
    let inside = false;
    for (let i = 0, j = KA.length - 1; i < KA.length; j = i++) {
      const [yi, xi] = KA[i], [yj, xj] = KA[j];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function nearestTown(lat, lon) {
    let best = TOWNS[0], d0 = 1e9;
    TOWNS.forEach(t => { const d = (t[1] - lat) ** 2 + (t[2] - lon) ** 2; if (d < d0) { d0 = d; best = t; } });
    return best[0];
  }
  const istHour = () => (new Date().getUTCHours() + 5.5 + new Date().getUTCMinutes() / 60) % 24;

  // ─── DATA: LIVE GRID ───
  async function loadLive() {
    const cacheId = 'bfo-live-v4-' + REG.key, cached = sessionStorage.getItem(cacheId);
    if (cached) { const c = JSON.parse(cached); if (Date.now() - c.at < 20 * 60e3) return c.data; }
    const lat = GRID.map(p => p[0]).join(','), lon = GRID.map(p => p[1]).join(',');
    const wx = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,soil_temperature_0cm,cloud_cover&daily=precipitation_sum&past_days=30&forecast_days=1&wind_speed_unit=ms&timezone=Asia%2FKolkata`;
    const aq = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5`;
    const [w, a] = await Promise.all([fetch(wx).then(r => { if (!r.ok) throw new Error('weather ' + r.status); return r.json(); }),
                                      fetch(aq).then(r => r.ok ? r.json() : null).catch(() => null)]);
    const pick = (arr, f) => arr.map(x => { try { const v = f(x); return (v == null || isNaN(v)) ? null : v; } catch (e) { return null; } });
    const data = {
      time: (w[BLR_IDX].current.time || '').slice(11, 16),
      values: {
        air:   pick(w, x => x.current.temperature_2m),
        surf:  pick(w, x => x.current.soil_temperature_0cm),
        rain:  pick(w, x => x.daily.precipitation_sum.slice(0, 30).reduce((s, v) => s + (v || 0), 0)),
        rh:    pick(w, x => x.current.relative_humidity_2m),
        wind:  pick(w, x => x.current.wind_speed_10m),
        wdir:  pick(w, x => x.current.wind_direction_10m),
        cloud: pick(w, x => x.current.cloud_cover),
        pm25:  a ? pick(a, x => x.current.pm2_5) : GRID.map(() => null)
      }
    };
    try { sessionStorage.setItem(cacheId, JSON.stringify({ at: Date.now(), data })); } catch (e) {}
    return data;
  }

  // ─── DATA: ERA5 RECORD FOR BENGALURU ───
  function loadRecord() {
    if (record) return Promise.resolve(record);
    if (recordLoading) return recordLoading;
    const cached = localStorage.getItem('bfo-era5-blr-v1');
    if (cached) { record = JSON.parse(cached); return Promise.resolve(record); }
    const vars = LAYERS.filter(l => l.hist).map(l => l.hist).join(',');
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${BLR[0]}&longitude=${BLR[1]}&start_date=1980-01-01&end_date=${REC_END}-12-31&daily=${vars}&wind_speed_unit=ms&timezone=Asia%2FKolkata`;
    recordLoading = fetch(url).then(r => { if (!r.ok) throw new Error('archive ' + r.status); return r.json(); }).then(j => {
      const out = {};
      LAYERS.filter(l => l.hist).forEach(l => {
        const acc = {};
        j.daily.time.forEach((t, i) => {
          const v = j.daily[l.hist][i]; if (v == null) return;
          const y = +t.slice(0, 4); (acc[y] = acc[y] || [0, 0]); acc[y][0] += v; acc[y][1]++;
        });
        out[l.key] = {};
        Object.keys(acc).forEach(y => { const [s, n] = acc[y]; if (n > 300) out[l.key][y] = l.agg === 'sum' ? s : s / n; });
      });
      record = out;
      try { localStorage.setItem('bfo-era5-blr-v1', JSON.stringify(out)); } catch (e) {}
      return out;
    }).catch(err => { recordLoading = null; throw err; });
    return recordLoading;
  }
  const recentMean = key => { const r = record[key]; let s = 0, n = 0; for (let y = 2016; y <= REC_END; y++) if (r[y] != null) { s += r[y]; n++; } return n ? s / n : null; };

  // ─── RASTERS (IDW from the grid) ───
  let RW = REG.rw, RH = REG.rh;
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  let MN = mercY(BOUNDS.n), MS = mercY(BOUNDS.s);
  const latOfRow = r => { const m = MN + (MS - MN) * (r + 0.5) / RH; return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI; };
  const lonOfCol = c => BOUNDS.w + (BOUNDS.e - BOUNDS.w) * (c + 0.5) / RW;
  let mask = null;
  function buildMask() {
    mask = new Uint8Array(RW * RH);
    for (let r = 0; r < RH; r++) { const la = latOfRow(r); for (let c = 0; c < RW; c++) mask[r * RW + c] = inPoly(la, lonOfCol(c)) ? 1 : 0; }
  }
  function idw(vals, lat, lon) {
    let s = 0, w = 0;
    for (let i = 0; i < GRID.length; i++) {
      const v = vals[i]; if (v == null) continue;
      const dy = GRID[i][0] - lat, dx = (GRID[i][1] - lon) * 0.97, d2 = dx * dx + dy * dy;
      if (d2 < 1e-6) return v;
      const k = 1 / (d2 * Math.sqrt(d2)); s += v * k; w += k;   // power 3: local detail without hard cells
    }
    return w ? s / w : NaN;
  }
  // The grid is regular (11 rows × 9 cols), so use Catmull-Rom bicubic interpolation; IDW only as a fallback for gaps
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  function gridAt(vals, lat, lon) {
    const GR = REG.rows, GC = REG.cols, gi = (lat - BOUNDS.s) / REG.di, gj = (lon - BOUNDS.w) / REG.dj;
    const i1 = Math.max(0, Math.min(GR - 2, Math.floor(gi))), j1 = Math.max(0, Math.min(GC - 2, Math.floor(gj)));
    const ti = Math.max(0, Math.min(1, gi - i1)), tj = Math.max(0, Math.min(1, gj - j1));
    const g = (i, j) => vals[Math.max(0, Math.min(GR - 1, i)) * GC + Math.max(0, Math.min(GC - 1, j))];
    const rows = [];
    for (let di = -1; di <= 2; di++) {
      const a = g(i1 + di, j1 - 1), b = g(i1 + di, j1), c = g(i1 + di, j1 + 1), d = g(i1 + di, j1 + 2);
      if (a == null || b == null || c == null || d == null) return idw(vals, lat, lon);
      rows.push(cr(a, b, c, d, tj));
    }
    return cr(rows[0], rows[1], rows[2], rows[3], ti);
  }
  function buildRaster(vals, masked) {
    if (!mask) buildMask();
    const out = new Float32Array(RW * RH).fill(NaN);
    if (vals.every(v => v == null)) return out;
    for (let r = 0; r < RH; r++) { const la = latOfRow(r); for (let c = 0; c < RW; c++) if (!masked || mask[r * RW + c]) out[r * RW + c] = gridAt(vals, la, lonOfCol(c)); }
    return out;
  }
  const getRaster = key => raster[key] || (raster[key] = buildRaster(live.values[key], true));
  function getFull(key) {
    if (full[key]) return full[key];
    if (key === 'u' || key === 'v') {   // meteorological direction = where the wind comes FROM
      const sp = live.values.wind, dir = live.values.wdir;
      const u = GRID.map((_, i) => sp[i] == null || dir[i] == null ? null : -sp[i] * Math.sin(dir[i] * Math.PI / 180));
      const v = GRID.map((_, i) => sp[i] == null || dir[i] == null ? null : -sp[i] * Math.cos(dir[i] * Math.PI / 180));
      full.u = buildRaster(u, false); full.v = buildRaster(v, false);
      return full[key];
    }
    return (full[key] = buildRaster(live.values[key], false));
  }
  const liveAt = (lat, lon) => (live && inPoly(lat, lon)) ? gridAt(live.values[layer.key], lat, lon) : NaN;
  const meanOf = arr => { let s = 0, n = 0; arr.forEach(v => { if (v != null) { s += v; n++; } }); return n ? s / n : 0; };

  // Fit each colour scale to what is actually out there today (inside the state), with headroom for projections
  function fitRanges() {
    LAYERS.forEach(l => {
      const vals = GRID.map((p, i) => inPoly(p[0], p[1]) || i === BLR_IDX ? live.values[l.key][i] : null).filter(v => v != null);
      if (vals.length < 4) return;
      const mn = Math.min(...vals), mx = Math.max(...vals), pad = (mx - mn) * 0.1 || 1;
      const step = l.dec ? 1 : (mx - mn > 50 ? 10 : 5);
      l.lo = Math.max(l.key === 'rain' || l.key === 'pm25' || l.key === 'wind' ? 0 : -Infinity, Math.floor((mn - pad) / step) * step);
      l.hi = Math.ceil((mx + pad + (l.proj ? 3.5 : 0)) / step) * step;
      if (l.key === 'rh') l.hi = Math.min(100, l.hi);
    });
    renderLegend();
  }

  // ─── PREDICTION ENGINE (BhuVyom repo · backend/engines/prediction) ───
  // NASA POWER monthly (MERRA-2) forecast: 25 cells of 0.5° × 0.625° around Bengaluru, origin Dec 2025, with 80 % / 95 % intervals.
  const PE = window.BHUVYOM_PREDICTION || null;
  const PE_VAR = { air: 'T2M', rain: 'PRECTOTCORR' };
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function peNow() { const d = new Date(Date.now() + 5.5 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; }
  function peCell(P, lat, lon) {
    let best = null, d0 = 1e9;
    P.cells.forEach((c, i) => { const dy = Math.abs(lat - c.lat), dx = Math.abs(lon - c.lon); if (dy <= 0.25 && dx <= 0.3125 && dy * dy + dx * dx < d0) { d0 = dy * dy + dx * dx; best = i; } });
    return best;
  }
  // One line for the readout, or '' when the engine has nothing for this layer / place / month
  function engineNote(lat, lon) {
    const P = PE && PE.vars[PE_VAR[layer.key]]; if (!P) return '';
    const ci = lat == null ? P.cells.findIndex(c => c.city) : peCell(P, lat, lon);
    const now = peNow(), key = now.y + '-' + String(now.m).padStart(2, '0'), ti = P.times.indexOf(key);
    if (ci < 0 || ci == null || ti < 0) return '';
    const g = k => P.f[k][ci][ti]; if (g('forecast') == null) return '';
    const days = new Date(now.y, now.m, 0).getDate(), rain = layer.key === 'rain', k = rain ? days : 1;
    const f = v => (v * k).toFixed(rain ? 0 : 1), u = rain ? 'mm' : '°C';
    const h = (now.y - (+P.origin.slice(0, 4))) * 12 + now.m - (+P.origin.slice(5));
    const hz = Math.max(1, Math.min(12, h)), skill = P.skill_by_h[hz];
    const how = skill > 0.02 ? `model beats climatology by ${Math.round(skill * 100)} % at ${hz} months` : `at ${hz} months the engine falls back to the monthly climatology (no skill beyond 4 months)`;
    return `NASA POWER engine · ${MONTHS[now.m - 1]} ${now.y} ${rain ? 'total' : 'mean'}: <b>${f(g('forecast'))} ${u}</b>` +
           `80 % range ${f(g('pi80_low'))}–${f(g('pi80_high'))} ${u} · ${how}. ${rain ? 'A monthly total' : 'A monthly average'}, not a live reading.`;
  }

  // ─── WHAT THE TIMELINE SAYS FOR THE CURRENT YEAR ───
  // { value (Bengaluru), shift (added to the live field), scale (rain intensity ratio), mode, note }
  function yearState() {
    const ly = layer, liveBlr = live ? live.values[ly.key][BLR_IDX] : null;
    if (year === NOW_YEAR) return { value: liveBlr, shift: 0, scale: 1, mode: 'live' };
    if (year <= REC_END) {
      if (!ly.hist) return { value: null, shift: 0, scale: 1, mode: 'none', note: `No yearly record for ${ly.label.toLowerCase()} — try air temperature, rainfall, humidity or wind. The map shows live conditions.` };
      if (!record) return { value: null, shift: 0, scale: 1, mode: 'loading', note: 'Loading the 1980–2025 record…' };
      const v = record[ly.key][year], base = recentMean(ly.key);
      if (ly.agg === 'sum') return { value: v, shift: 0, scale: base ? v / base : 1, mode: 'record',
        note: `<b>${Math.round(v).toLocaleString('en-IN')} mm</b>fell on Bengaluru in ${year} · 2016–2025 average ${fmt(base, ly)} · ERA5. Rain on the map is scaled to that year.` };
      return { value: v, shift: liveBlr == null ? 0 : v - liveBlr, scale: 1, mode: 'record',
               note: `<b>${signed(v - base, ly)}</b>vs the 2016–2025 average · ${year} annual mean · ERA5` };
    }
    if (!ly.proj) return { value: null, shift: 0, scale: 1, mode: 'none', note: `No scenario projection for ${ly.label.split(' · ')[0].toLowerCase()} — only temperature layers are projected. The map shows live conditions.` };
    const warm = ar6(year, scenario);
    if (ly.proj === 'record') {
      if (!record) return { value: null, shift: 0, scale: 1, mode: 'loading', note: 'Loading the 1980–2025 record…' };
      const base = recentMean(ly.key), v = base + (warm - ar6(2020.5, scenario));
      return { value: v, shift: liveBlr == null ? 0 : v - liveBlr, scale: 1, mode: 'proj',
               note: `<b>${signed(v - base, ly)}</b>vs the 2016–2025 average · ${SCEN[scenario]} · IPCC AR6` };
    }
    const d = warm - ar6(NOW_YEAR, scenario);
    return { value: liveBlr == null ? null : liveBlr + d, shift: d, scale: 1, mode: 'proj',
             note: `<b>${signed(d, ly)}</b>on today’s reading by ${year} · ${SCEN[scenario]} · IPCC AR6` };
  }

  // ─── COLOUR FIELD (Leaflet image overlay) ───
  function renderField() {
    if (!map || !live) return;
    if (!layer.fieldA) { if (fieldOverlay) { map.removeLayer(fieldOverlay); fieldOverlay = null; } return; }
    const R = getRaster(layer.key), cv = document.createElement('canvas'); cv.width = RW; cv.height = RH;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(RW, RH), span = layer.hi - layer.lo, A = Math.round(255 * layer.fieldA);
    for (let i = 0; i < R.length; i++) {
      const v = R[i]; if (isNaN(v)) continue;
      const [r, g, b] = rampAt((v + st.shift - layer.lo) / span, layer.stops);
      img.data[i*4] = r; img.data[i*4+1] = g; img.data[i*4+2] = b; img.data[i*4+3] = A;
    }
    ctx.putImageData(img, 0, 0);
    const url = cv.toDataURL();
    if (fieldOverlay) fieldOverlay.setUrl(url);
    else fieldOverlay = L.imageOverlay(url, [[BOUNDS.s, BOUNDS.w], [BOUNDS.n, BOUNDS.e]], { className: 'ts-field', interactive: false }).addTo(map);
  }

  // =====================================================================
  // EFFECTS — one animated canvas over the map, clipped to the state
  // =====================================================================
  const fxCv = $('ts-fx'), fx = fxCv.getContext('2d');
  const trail = document.createElement('canvas'), tctx = trail.getContext('2d');
  const cache = document.createElement('canvas'), cctx = cache.getContext('2d');
  const veilCv = document.createElement('canvas'), vctx = veilCv.getContext('2d');
  let W = 0, H = 0, DPR = 1, V = null, veilImg = null, cacheKey = '', isoCache = null, T = 0;

  function sizeFx() {
    DPR = Math.min(2, window.devicePixelRatio || 1); W = engine.clientWidth; H = engine.clientHeight;   // inner box = map box
    [fxCv, trail, cache].forEach(c => { c.width = W * DPR; c.height = H * DPR; });
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0); cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cacheKey = '';
  }
  const getView = () => { const a = map.latLngToContainerPoint([BOUNDS.n, BOUNDS.w]), b = map.latLngToContainerPoint([BOUNDS.s, BOUNDS.e]); return { x0: a.x, y0: a.y, dx: b.x - a.x, dy: b.y - a.y }; };
  let KAF = KA.map(([la, lo]) => [(lo - BOUNDS.w) / (BOUNDS.e - BOUNDS.w), (MN - mercY(la)) / (MN - MS)]);
  function clipState(ctx) {
    ctx.beginPath();
    KAF.forEach((f, i) => { const x = V.x0 + f[0] * V.dx, y = V.y0 + f[1] * V.dy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.clip();
  }
  const at = (R, fx_, fy_) => { const c = (fx_ * RW) | 0, r = (fy_ * RH) | 0; return (c < 0 || r < 0 || c >= RW || r >= RH) ? NaN : R[r * RW + c]; };
  const inMask = (fx_, fy_) => { const c = (fx_ * RW) | 0, r = (fy_ * RH) | 0; return c >= 0 && r >= 0 && c < RW && r < RH && mask[r * RW + c] === 1; };
  const meanWind = () => { if (!live) return [0, 0]; const U = getFull('u'), Vv = getFull('v'); let su = 0, sv = 0, n = 0; for (let i = 0; i < U.length; i += 37) if (!isNaN(U[i])) { su += U[i]; sv += Vv[i]; n++; } return n ? [su / n, sv / n] : [0, 0]; };
  let MW = [0, 0];

  // Tileable fractal value noise (for clouds, mist and haze)
  const NS = 256;
  function makeNoise(seed, oct) {
    let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = new Float32Array(NS * NS); let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const cells = 4 << o, lat = new Float32Array(cells * cells).map(rnd);
      for (let y = 0; y < NS; y++) {
        const gy = y / NS * cells, y0 = gy | 0, ty = gy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % cells;
        for (let x = 0; x < NS; x++) {
          const gx = x / NS * cells, x0 = gx | 0, tx = gx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % cells;
          const a = lat[y0 * cells + x0], b = lat[y0 * cells + x1], c = lat[y1 * cells + x0], d = lat[y1 * cells + x1];
          out[y * NS + x] += amp * ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy);
        }
      }
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    let mn = 1, mx = 0; out.forEach(v => { mn = Math.min(mn, v); mx = Math.max(mx, v); });
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
    return out;
  }
  let NA = null, NB = null;
  const nz = (N, x, y) => {
    x = ((x % NS) + NS) % NS; y = ((y % NS) + NS) % NS;
    const x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0, x1 = (x0 + 1) % NS, y1 = (y0 + 1) % NS;
    const a = N[y0 * NS + x0], b = N[y0 * NS + x1], c = N[y1 * NS + x0], d = N[y1 * NS + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  // Soft veil (clouds / mist / haze): rendered at ¼ resolution, anchored to the map, drifting with the mean wind
  function drawVeil(o) {
    const q = 3, vw = Math.ceil(W / q), vh = Math.ceil(H / q);
    if (veilCv.width !== vw || veilCv.height !== vh) { veilCv.width = vw; veilCv.height = vh; veilImg = vctx.createImageData(vw, vh); }
    const d = veilImg.data, t = T / 1000;
    const dx = -MW[0] * o.speed * t, dy = MW[1] * o.speed * t;   // drift downwind (screen y is down)
    for (let y = 0; y < vh; y++) {
      const fy_ = (y * q + q / 2 - V.y0) / V.dy;
      for (let x = 0; x < vw; x++) {
        const i = (y * vw + x) * 4, fx_ = (x * q + q / 2 - V.x0) / V.dx;
        if (fx_ < 0 || fx_ > 1 || fy_ < 0 || fy_ > 1) { d[i+3] = 0; continue; }
        const den = o.dens(fx_, fy_);
        if (!(den > 0.02)) { d[i+3] = 0; continue; }
        const u = fx_ * o.scale * NS, v = fy_ * o.scale * NS * 1.4;
        const n = 0.65 * nz(NA, u + dx, v + dy) + 0.35 * nz(NB, u * 2.1 - dx * 1.6, v * 2.1 - dy * 1.6);
        const th = 1 - den;
        const a = smooth(th - o.soft, th + o.soft * 1.6, n) * o.maxA * (0.4 + 0.6 * den);
        const shade = o.shade ? o.shade(fx_, fy_, n - th) : 1;
        d[i] = o.tint[0] * shade; d[i+1] = o.tint[1] * shade; d[i+2] = o.tint[2] * shade; d[i+3] = a * 255;
      }
    }
    vctx.putImageData(veilImg, 0, 0);
    fx.save(); clipState(fx); fx.imageSmoothingEnabled = true; fx.drawImage(veilCv, 0, 0, vw * q, vh * q); fx.restore();
  }

  // Rain: short streaks spawned where the last 30 days' rain fell, slanted by the wind
  let drops = [];
  function drawRain(scale) {
    const R = getRaster('rain'), hi = Math.max(60, layer.hi);
    const slant = Math.max(-0.45, Math.min(0.45, -MW[0] * 0.08));
    const kpx = Math.max(0.6, V.dx / 900);
    for (let k = 0; k < 160; k++) {
      const fx_ = Math.random(), fy_ = Math.random();
      if (!inMask(fx_, fy_)) continue;
      const r = clamp01(at(R, fx_, fy_) * scale / hi);
      if (Math.random() < r * 1.1 && drops.length < 1800) drops.push({ fx: fx_, fy: fy_, life: 0, max: 12 + Math.random() * 12, len: (10 + Math.random() * 12) * kpx, sp: (11 + Math.random() * 7) * kpx });
    }
    fx.save(); clipState(fx);
    fx.lineWidth = 1; fx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      fx.strokeStyle = pass ? 'rgba(232,242,255,0.85)' : 'rgba(170,205,255,0.5)'; fx.lineWidth = pass ? 1.2 : 1;
      fx.beginPath();
      for (let i = 0; i < drops.length; i++) {
        const p = drops[i]; if ((i & 1) !== pass) continue;
        const x = V.x0 + p.fx * V.dx, y = V.y0 + p.fy * V.dy, oy = p.life * p.sp;
        fx.moveTo(x + oy * slant, y + oy - p.len); fx.lineTo(x + (oy + p.len) * slant, y + oy);
      }
      fx.stroke();
    }
    // splashes at the end of each streak
    fx.fillStyle = 'rgba(210,230,255,0.35)';
    drops.forEach(p => { if (p.life > p.max - 2) { const x = V.x0 + p.fx * V.dx + p.life * p.sp * slant, y = V.y0 + p.fy * V.dy + p.life * p.sp; fx.fillRect(x - 1.5, y, 3, 1); } });
    fx.restore();
    drops.forEach(p => p.life++);
    drops = drops.filter(p => p.life < p.max);
  }

  // Wind: particles advected on the live u/v field, leaving fading trails
  let parts = [];
  const seed = p => { for (let k = 0; k < 30; k++) { const a = Math.random(), b = Math.random(); if (inMask(a, b)) { p.fx = a; p.fy = b; break; } } p.age = 0; p.max = 60 + Math.random() * 90; return p; };
  function resetTrail() { tctx.clearRect(0, 0, W, H); }
  function stepWind(drawTrail) {
    const U = getFull('u'), Vv = getFull('v'), n = Math.round(Math.min(2400, Math.max(900, V.dx * V.dy / 380)));
    while (parts.length < n) parts.push(seed({}));
    if (parts.length > n) parts.length = n;
    const kpx = 0.85 * Math.max(0.6, V.dx / 900), hi = Math.max(4, layer.hi), B = 7, buckets = Array.from({ length: B }, () => []);
    tctx.globalCompositeOperation = 'destination-in'; tctx.fillStyle = 'rgba(0,0,0,0.955)'; tctx.fillRect(0, 0, W, H);
    tctx.globalCompositeOperation = 'source-over';
    parts.forEach(p => {
      const u = at(U, p.fx, p.fy), v = at(Vv, p.fx, p.fy);
      if (isNaN(u) || ++p.age > p.max || !inMask(p.fx, p.fy)) { seed(p); return; }
      const x = V.x0 + p.fx * V.dx, y = V.y0 + p.fy * V.dy;
      p.fx += u * kpx / V.dx; p.fy -= v * kpx / V.dy;
      const b = Math.min(B - 1, (Math.hypot(u, v) / hi * B) | 0);
      buckets[b].push(x, y, V.x0 + p.fx * V.dx, V.y0 + p.fy * V.dy);
    });
    tctx.lineWidth = 1.5; tctx.lineCap = 'round';
    buckets.forEach((seg, b) => {
      if (!seg.length) return;
      const c = rampAt((b + 0.5) / B * 0.7 + 0.3, layer.stops);
      tctx.strokeStyle = `rgba(${c.join(',')},0.95)`; tctx.beginPath();
      for (let i = 0; i < seg.length; i += 4) { tctx.moveTo(seg[i], seg[i+1]); tctx.lineTo(seg[i+2], seg[i+3]); }
      tctx.stroke();
    });
    if (drawTrail !== false) { fx.save(); clipState(fx); fx.drawImage(trail, 0, 0, W, H); fx.restore(); }
  }

  // PM2.5 particulates drifting slowly on the wind
  let specks = [];
  function drawSpecks() {
    const U = getFull('u'), Vv = getFull('v'), R = getRaster('pm25'), span = Math.max(20, layer.hi);
    while (specks.length < 700) specks.push(seed({}));
    const kpx = 0.06 * Math.max(0.6, V.dx / 900);
    fx.save(); clipState(fx);
    specks.forEach(p => {
      const u = at(U, p.fx, p.fy), v = at(Vv, p.fx, p.fy), c = at(R, p.fx, p.fy);
      if (isNaN(u) || isNaN(c) || ++p.age > p.max * 4) { seed(p); return; }
      p.fx += (u * kpx + (Math.random() - 0.5) * 0.4) / V.dx; p.fy -= (v * kpx + (Math.random() - 0.5) * 0.4) / V.dy;
      const t = clamp01(c / span), life = Math.sin(Math.PI * p.age / (p.max * 4));
      const col = rampAt(0.45 + t * 0.55, layer.stops);
      fx.fillStyle = `rgba(${col.join(',')},${(0.3 + 0.7 * t) * life})`;
      fx.fillRect(V.x0 + p.fx * V.dx, V.y0 + p.fy * V.dy, 2, 2);
    });
    fx.restore();
  }

  // Air temperature: isotherms by marching squares on the raster (cached per shift), drawn as slowly flowing dashes
  const niceStep = range => range <= 6 ? 0.5 : range <= 14 ? 1 : 2;
  function isolines(shift) {
    const key = shift.toFixed(2);
    if (isoCache && isoCache.key === key) return isoCache;
    const R = getRaster('air'), step = niceStep(layer.hi - layer.lo), s = 2, minor = [], major = [];
    const levels = []; for (let L = Math.ceil(layer.lo / step) * step; L <= layer.hi; L += step) levels.push(L);
    const P = (c, r) => [(c + 0.5) / RW, (r + 0.5) / RH];
    for (let r = 0; r + s < RH; r += s) for (let c = 0; c + s < RW; c += s) {
      const v0 = R[r*RW+c] + shift, v1 = R[r*RW+c+s] + shift, v2 = R[(r+s)*RW+c+s] + shift, v3 = R[(r+s)*RW+c] + shift;
      if (isNaN(v0) || isNaN(v1) || isNaN(v2) || isNaN(v3)) continue;
      const lo = Math.min(v0, v1, v2, v3), hi = Math.max(v0, v1, v2, v3);
      levels.forEach(L => {
        if (L < lo || L > hi) return;
        const idx = (v0 > L ? 8 : 0) | (v1 > L ? 4 : 0) | (v2 > L ? 2 : 0) | (v3 > L ? 1 : 0);
        if (idx === 0 || idx === 15) return;
        const T_ = P(c + s * (L - v0) / (v1 - v0), r), Rr = P(c + s, r + s * (L - v1) / (v2 - v1)),
              Bm = P(c + s * (L - v3) / (v2 - v3), r + s), Lf = P(c, r + s * (L - v0) / (v3 - v0));
        const segs = { 1:[[Lf,Bm]], 2:[[Bm,Rr]], 3:[[Lf,Rr]], 4:[[T_,Rr]], 5:[[Lf,T_],[Bm,Rr]], 6:[[T_,Bm]], 7:[[Lf,T_]],
                       8:[[Lf,T_]], 9:[[T_,Bm]], 10:[[T_,Rr],[Lf,Bm]], 11:[[T_,Rr]], 12:[[Lf,Rr]], 13:[[Bm,Rr]], 14:[[Lf,Bm]] }[idx];
        const out = Math.abs(L / (step * 2) - Math.round(L / (step * 2))) < 1e-6 ? major : minor;
        segs.forEach(sg => out.push(sg[0][0], sg[0][1], sg[1][0], sg[1][1]));
      });
    }
    return (isoCache = { key, minor, major, step });
  }
  function drawIsotherms(shift) {
    const iso = isolines(shift);
    fx.save(); clipState(fx);
    fx.lineCap = 'round';
    [[iso.minor, 'rgba(255,255,255,0.3)', 1, true], [iso.major, 'rgba(255,255,255,0.62)', 1.3, false]].forEach(([seg, col, lw, dashed]) => {
      fx.strokeStyle = col; fx.lineWidth = lw;
      fx.setLineDash(dashed ? [3, 4] : []); fx.lineDashOffset = dashed && !reduceMotion ? -T / 90 : 0;   // minor lines drift slowly
      fx.beginPath();
      for (let i = 0; i < seg.length; i += 4) { fx.moveTo(V.x0 + seg[i] * V.dx, V.y0 + seg[i+1] * V.dy); fx.lineTo(V.x0 + seg[i+2] * V.dx, V.y0 + seg[i+3] * V.dy); }
      fx.stroke();
    });
    fx.restore();
  }

  // Surface temperature: thermal dot matrix (cached per view) + a satellite-style scan line
  function drawDots(shift) {
    const key = [V.x0, V.y0, V.dx, V.dy, shift].map(v => v.toFixed(1)).join('|') + W + 'x' + H;
    if (cacheKey !== key) {
      cacheKey = key; cctx.clearRect(0, 0, W, H);
      const R = getRaster('surf'), sp = 9, span = layer.hi - layer.lo;
      for (let y = sp / 2; y < H; y += sp) {
        const fy_ = (y - V.y0) / V.dy; if (fy_ < 0 || fy_ > 1) continue;
        for (let x = sp / 2; x < W; x += sp) {
          const fx_ = (x - V.x0) / V.dx; if (fx_ < 0 || fx_ > 1) continue;
          const v = at(R, fx_, fy_); if (isNaN(v)) continue;
          const t = clamp01((v + shift - layer.lo) / span), c = rampAt(t, layer.stops);
          cctx.fillStyle = `rgba(${c.join(',')},${0.55 + 0.45 * t})`;
          cctx.beginPath(); cctx.arc(x, y, 0.9 + 3.1 * t, 0, Math.PI * 2); cctx.fill();
        }
      }
    }
    fx.drawImage(cache, 0, 0, W, H);
    if (reduceMotion) return;
    const top = V.y0, h = V.dy, y = top + ((T / 26) % (h + 160)) - 80;
    fx.save(); clipState(fx); fx.globalCompositeOperation = 'lighter';
    const g = fx.createLinearGradient(0, y - 40, 0, y + 40);
    g.addColorStop(0, 'rgba(250,214,150,0)'); g.addColorStop(0.5, 'rgba(250,214,150,0.16)'); g.addColorStop(1, 'rgba(250,214,150,0)');
    fx.fillStyle = g; fx.fillRect(0, y - 40, W, 80);
    fx.restore();
  }

  function drawFx() {
    if (!map || !live || !W) return;
    V = getView(); MW = meanWind();
    fx.setTransform(DPR, 0, 0, DPR, 0, 0); fx.clearRect(0, 0, W, H);
    const night = basemap === 'night', k = layer.key, shift = st ? st.shift : 0;
    if (k === 'air') drawIsotherms(shift);
    else if (k === 'surf') drawDots(shift);
    else if (k === 'rain') {
      const C = getFull('cloud'), R = getRaster('rain'), hi = Math.max(60, layer.hi), sc = st ? st.scale : 1;
      drawVeil({ scale: 2.2 * REG.fxScale, speed: 0.9, soft: 0.12, maxA: night ? 0.8 : 0.92, tint: night ? [196,204,222] : [250,251,253],
                 dens: (a, b) => clamp01((at(C, a, b) || 0) / 100) * 0.92,
                 shade: (a, b, e) => { const wet = clamp01((at(R, a, b) || 0) * sc / hi); return Math.max(0.38, Math.min(1, 0.72 + e * 0.9 - wet * 0.42)); } });
    }
    else if (k === 'rh') {
      const R = getRaster('rh');
      drawVeil({ scale: 1.3 * REG.fxScale, speed: 0.35, soft: 0.34, maxA: night ? 0.42 : 0.55, tint: night ? [150,175,195] : [214,232,240],
                 dens: (a, b) => clamp01(((at(R, a, b) || 0) - 35) / 65) });
    }
    else if (k === 'wind') stepWind();
    else if (k === 'pm25') {
      const R = getRaster('pm25'), span = Math.max(20, layer.hi);
      drawVeil({ scale: 3.2 * REG.fxScale, speed: 0.25, soft: 0.4, maxA: 0.5, tint: night ? [150,120,100] : [196,170,140],
                 dens: (a, b) => clamp01((at(R, a, b) || 0) / span) * 0.85 });
      drawSpecks();
    }
  }

  // Animation loop: only while the frame is on screen and the tab is visible
  let onScreen = false, rafId = 0, lastFrame = 0;
  function loop(ts) {
    rafId = 0;
    if (!onScreen || document.hidden || reduceMotion) return;
    rafId = requestAnimationFrame(loop);
    if (ts - lastFrame < 32) return;           // ~30 fps is plenty for weather
    lastFrame = ts; T = ts; drawFx();
  }
  function kick() {
    if (reduceMotion) {                        // one still frame; wind gets pre-advected streaks
      if (!map || !live) return;
      V = getView(); MW = meanWind(); T = 0;
      if (layer.key === 'wind') { resetTrail(); for (let i = 0; i < 40; i++) stepWind(false); }
      drawFx();
      return;
    }
    if (!rafId && onScreen && !document.hidden) rafId = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', kick);

  // ─── RENDER ───
  function renderReadout() {
    const ly = layer;
    const when = st.mode === 'live' ? (live ? `Live · ${live.time} IST` : 'Live') : (year <= REC_END ? `${year} · Record` : `${year} · Projection`);
    $('ts-ro-layer').textContent = `${ly.label} · ${when}`;
    if (st.mode === 'live' && hover && !isNaN(hover.live)) {
      $('ts-ro-value').textContent = fmt(hover.live, ly);
      $('ts-ro-place').textContent = `NEAR ${hover.name} · ${hover.lat.toFixed(2)}° N ${hover.lon.toFixed(2)}° E`;
    } else {
      $('ts-ro-value').textContent = fmt(st.value, ly);
      $('ts-ro-place').textContent = REG.focal;
    }
    let sub;
    if (!live && st.mode === 'live') sub = liveEl.dataset.state === 'error' ? 'Live data is unavailable right now — check your connection and reload.' : 'Fetching live conditions…';
    else if (st.mode === 'live') {
      sub = hover ? `${ly.src}. Move the year to look back or ahead.` : `${ly.src}. Hover the map to read any point in ${REG.name}.`;
      if (ly.key === 'rain' && live) { const c = live.values.cloud[BLR_IDX]; if (c != null) sub = `${ly.src}. Cloud over Bengaluru right now: ${Math.round(c)}%.`; }
      if (ly.key === 'wind' && live) { const d = live.values.wdir[BLR_IDX]; if (d != null) sub = `${ly.src}. Over Bengaluru it blows from ${['N','NE','E','SE','S','SW','W','NW'][Math.round(d / 45) % 8]} (${Math.round(d)}°).`; }
    }
    else sub = st.note;
    if (st.mode === 'live' && live) { const en = hover ? engineNote(hover.lat, hover.lon) : engineNote(null, null); if (en) sub += '<br>' + en; }
    $('ts-ro-delta').innerHTML = sub;
  }

  function renderLegend() {
    $('ts-legend-label').textContent = `${layer.label} (${layer.unit})`;
    $('ts-legend-bar').style.background = rampCss(layer.stops);
    $('ts-legend-min').textContent = fmt(layer.lo, layer);
    $('ts-legend-max').textContent = fmt(layer.hi, layer);
    $('ts-legend-fx').textContent = FX_NOTE[layer.key](niceStep(layer.hi - layer.lo));
  }

  function renderDetail() {
    const s = SYSTEMS[layer.sys];
    $('ts-about-eyebrow').textContent = `System ${s.n}`;
    $('ts-about-name').textContent = s.name;
    $('ts-about-desc').textContent = s.desc;
    $('ts-var-count').textContent = s.vars.length;
    $('ts-subvars').innerHTML = s.vars.map(v => `<span class="ts-tag${v === layer.tag ? ' on' : ''}">${v}</span>`).join('');
  }

  // Each layer's colour: its ramp as a swatch, its bright end as the accent
  const swatch = l => `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 45%), conic-gradient(from 210deg, ${l.stops.filter(st => st[0] >= 0.2).map(st => `rgb(${st[1].join(',')})`).concat(`rgb(${rampAt(0.2, l.stops).join(',')})`).join(',')})`;
  const accentOf = l => rampAt(0.62, l.stops);
  function applyAccent() {
    const sec = $('simulations'), a = accentOf(layer);   // menu only: label + open border take the layer colour
    sec.style.setProperty('--acc', `rgb(${a.join(',')})`);
    sec.style.setProperty('--accrgb', a.join(','));
    $('ts-menu-sw').style.background = swatch(layer);
  }
  function renderMenu() {
    $('ts-menu-current').textContent = layer.label;
    menuList.innerHTML = LAYERS.map(l => { const a = accentOf(l).join(','); return (
      `<button type="button" class="ts-opt" role="menuitemradio" aria-checked="${l === layer}" data-layer="${l.key}" style="--oc:rgb(${a});--ocrgb:${a}">
         <span class="sw" aria-hidden="true" style="background:${swatch(l)}"></span>
         <span class="n">${l.label}</span><span class="u">${l.unit}</span><span class="s">${l.src}</span></button>`); }).join('');
    applyAccent();
  }

  function renderTime() {
    yearDisplay.textContent = year;
    yearSlider.value = year;
    yearFill.style.width = ((year - 1980) / 120 * 100) + '%';
    scenEl.classList.toggle('off', !layer.proj || year <= NOW_YEAR);
  }

  function render() {
    st = yearState();
    renderTime(); renderReadout(); renderField();
    if (reduceMotion) kick();
    return st;
  }
  function setLayer(ly) {
    layer = ly; hover = null; tip.style.display = 'none';
    isoCache = null; cacheKey = ''; drops = []; parts = []; specks = []; resetTrail();
    renderMenu(); renderLegend(); renderDetail(); render(); kick();
  }

  // ─── LAYER MENU ───
  function openMenu(open) {
    menuList.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) { const cur = menuList.querySelector('[aria-checked="true"]'); if (cur) cur.focus({ preventScroll: true }); }
  }
  menuBtn.addEventListener('click', () => openMenu(!menuList.classList.contains('open')));
  menuList.addEventListener('click', e => {
    const b = e.target.closest('[data-layer]'); if (!b) return;
    setLayer(LAYERS.find(l => l.key === b.dataset.layer)); openMenu(false); menuBtn.focus({ preventScroll: true });
  });
  menuList.addEventListener('keydown', e => {
    const items = [...menuList.querySelectorAll('.ts-opt')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuList.classList.contains('open')) { openMenu(false); menuBtn.focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('#ts-menu')) openMenu(false); });

  // ─── MAP ───
  function setBasemap(which) {
    basemap = which;
    document.querySelectorAll('[data-basemap]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.basemap === which)));
    if (!map) return;
    const on = which === 'day' ? baseDay : baseNight, off = which === 'day' ? baseNight : baseDay;
    if (map.hasLayer(off)) map.removeLayer(off);
    if (!map.hasLayer(on)) on.addTo(map).bringToBack();
    if (reduceMotion) kick();
  }
  document.querySelectorAll('[data-basemap]').forEach(b => b.addEventListener('click', () => setBasemap(b.dataset.basemap)));

  let cutLine = null;
  function fitState() {
    if (!map) return;
    const narrow = engine.clientWidth < 820;
    map.setMinZoom(REG.minZoom);
    map.fitBounds(L.latLngBounds(KA), { paddingTopLeft: [narrow ? 12 : 24, narrow ? 180 : 84], paddingBottomRight: [narrow ? 12 : 24, narrow ? 150 : 104] });
  }
  function initMap() {
    if (map || typeof L === 'undefined') return;
    map = L.map('terra-leaflet-map', { zoomControl: false, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.25, minZoom: 5, maxZoom: 12 });
    L.control.zoom({ position: 'topright' }).addTo(map);
    baseDay = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12 });
    baseNight = L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', { maxNativeZoom: 8, maxZoom: 12 });
    setBasemap(basemap);
    fitState();
    map.createPane('cut'); map.getPane('cut').style.zIndex = 450; map.getPane('cut').style.pointerEvents = 'none';
    cutLine = L.polygon(KA, { pane: 'cut', interactive: false, color: '#F2F2F2', weight: 1.2, opacity: 0.85, fill: false }).addTo(map);
    L.marker(BLR, { icon: L.divIcon({ className: 'ts-beacon', iconSize: [12, 12], iconAnchor: [6, 6] }), keyboard: false, interactive: false }).addTo(map);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    map.on('movestart zoomstart', () => { tip.style.display = 'none'; resetTrail(); drops = []; });
    map.on('move zoom', () => { if (reduceMotion) kick(); });
    map.on('moveend zoomend', () => { resetTrail(); if (reduceMotion) kick(); });

    const probe = e => {
      if (!live) return;
      const { lat, lng } = e.latlng, v = liveAt(lat, lng);
      if (isNaN(v)) { clearHover(); return; }
      hover = { name: nearestTown(lat, lng), lat, lon: lng, live: v };
      const shown = st.mode === 'live' || layer.agg === 'sum' || st.mode === 'none' || st.mode === 'loading' ? v : v + st.shift;
      tip.innerHTML = `<b>${hover.name}</b><span>${fmt(shown, layer)}</span>`;
      tip.style.left = e.containerPoint.x + 'px'; tip.style.top = e.containerPoint.y + 'px'; tip.style.display = 'block';
      renderReadout();
    };
    map.on('mousemove', probe); map.on('click', probe);
    map.on('mouseout', clearHover);
    setTimeout(() => { map.invalidateSize(); sizeFx(); }, 100);
  }
  function clearHover() { tip.style.display = 'none'; if (hover) { hover = null; renderReadout(); } }
  window.addEventListener('resize', () => { if (!map) return; map.invalidateSize(); sizeFx(); resetTrail(); kick(); });

  // ─── TIMELINE ───
  function setYear(y) {
    year = y;
    if (y !== NOW_YEAR && (layer.hist || layer.proj === 'record') && !record) loadRecord().then(() => render()).catch(() => {
      $('ts-ro-delta').textContent = 'The 1980–2025 record could not be loaded — check your connection.';
    });
    if (hover && y !== NOW_YEAR) clearHover();
    cacheKey = '';
    render();
  }
  yearSlider.addEventListener('input', () => setYear(parseInt(yearSlider.value, 10)));
  scenEl.addEventListener('click', e => {
    const b = e.target.closest('[data-scen]'); if (!b) return;
    scenario = b.dataset.scen;
    scenEl.querySelectorAll('[data-scen]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    cacheKey = ''; render();
  });
  function setPlaying(on) {
    clearInterval(playTimer);
    playBtn.innerHTML = on ? PAUSE : PLAY;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Pause timeline' : 'Play timeline');
    if (on) playTimer = setInterval(() => setYear(year >= 2100 ? 1980 : year + 1), reduceMotion ? 400 : 140);
  }
  playBtn.addEventListener('click', () => setPlaying(playBtn.getAttribute('aria-pressed') !== 'true'));

  // ─── SCROLL REVEAL ───
  const reveals = document.querySelectorAll('#simulations .sim-reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.15 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('in'));

  // ─── INIT ───
  playBtn.innerHTML = PLAY;
  basemap = (istHour() >= 18 || istHour() < 6) ? 'night' : 'day';   // match the real sky over Bengaluru
  setBasemap(basemap);
  renderMenu(); renderLegend(); renderDetail(); render();

  let started = false;
  function start() {
    if (started) return; started = true;
    initMap();
    setTimeout(() => {                         // build the noise after first paint
      NA = makeNoise(7, 6); NB = makeNoise(19, 5);
      loadRegion();
      loadRecord().then(() => { if (year !== NOW_YEAR) render(); }).catch(() => {});
    }, 30);
  }
  function loadRegion() {
    const k = REG.key;
    liveEl.dataset.state = 'loading'; liveEl.textContent = 'Connecting to live data';
    veilText.textContent = 'Loading live data…'; veil.hidden = false;
    loadLive().then(d => {
      if (REG.key !== k) return;                 // the user switched again while this was loading
      live = d; raster = {}; full = {};
      buildMask();
      fitRanges();
      liveEl.dataset.state = 'live'; liveEl.textContent = `Live · updated ${d.time} IST`;
      veil.hidden = true;
      sizeFx(); render(); kick();
    }).catch(() => {
      if (REG.key !== k) return;
      liveEl.dataset.state = 'error'; liveEl.textContent = 'Live data unavailable';
      veilText.textContent = 'Live data unavailable';
      render();
    });
  }

  // ─── REGION SWITCH: same engine, different place ───
  function setRegion(k) {
    if (!REGIONS[k] || (REG && REG.key === k)) return;
    setRegionData(k);
    RW = REG.rw; RH = REG.rh; MN = mercY(BOUNDS.n); MS = mercY(BOUNDS.s);
    KAF = KA.map(([la, lo]) => [(lo - BOUNDS.w) / (BOUNDS.e - BOUNDS.w), (MN - mercY(la)) / (MN - MS)]);
    mask = null; live = null; raster = {}; full = {}; isoCache = null; cacheKey = '';
    drops = []; parts = []; specks = []; resetTrail(); hover = null; tip.style.display = 'none';
    document.querySelectorAll('[data-region]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.region === k)));
    $('ts-region-label').textContent = REG.strip;
    if (map) {
      if (fieldOverlay) { map.removeLayer(fieldOverlay); fieldOverlay = null; }
      cutLine.setLatLngs(KA);
      fitState();
    }
    fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, fxCv.width, fxCv.height);
    render();
    if (started) loadRegion();
  }
  document.querySelectorAll('[data-region]').forEach(b => b.addEventListener('click', () => setRegion(b.dataset.region)));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { start(); io.disconnect(); } }, { rootMargin: '600px 0px' });
    io.observe(engine);
    new IntersectionObserver(es => { onScreen = es[0].isIntersecting; kick(); }).observe(engine);
  } else { onScreen = true; start(); }
})();
