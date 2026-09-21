export type UnitType = 'Standard Ducted' | 'Slimline' | 'Bulkhead' | 'Underfloor';

export interface UnitModel {
  brand: 'Daikin' | 'Fujitsu' | 'Mitsubishi Electric' | 'ActronAir';
  model: string;
  capacityKw?: number;
  type: UnitType;
}

export const UNIT_MODELS: UnitModel[] = [
  ...[
    ['ARTH24KHTA',7.1],['ARTH30KHTA',8.5],['ARTH36KHTA',10],['ARTH45KHTA',12.5],['ARTH54KHTA',14],['ARTH60KHTA',16],
  ].map(([model,capacityKw])=>({brand:'Fujitsu' as const,model:String(model),capacityKw:Number(capacityKw),type:'Standard Ducted' as const})),
  ...['ARTH18KMTAP','ARTH24KMTAP','ARTH30KMTAP','ARTH36KMTAP','ARTH45KMTAP','ARTH54KMTAP'].map(model=>({brand:'Fujitsu' as const,model,type:'Slimline' as const})),
  ...['ARTH09KLLAP','ARTH12KLLAP','ARTH18KLLAP','ARTH09KSLAP','ARTH12KSLAP','ARTH18KSLAP'].map(model=>({brand:'Fujitsu' as const,model,type:'Bulkhead' as const})),
  ...['FDYAN50A-C2V','FDYAN60A-C2V','FDYAN71A-C2V','FDYAN85A-C2V','FDYAN100A-C2V','FDYAN125A-C2V','FDYAN140A-C2V','FDYAN160A-C2V','FDYA71A9-C2V','FDYA100A-C2V','FDYA125A-C2V','FDYA140A-C2V','FDYA160A-C2V','FDYA180A-DV','FDYA180A-DY','FDYA200A-DY'].map(model=>({brand:'Daikin' as const,model,type:'Standard Ducted' as const})),
  ...['FBA50BVMA','FBA60BVMA','FBA71BVMA','FBA85BVMA','FBA100BVMA','FBA125BVMA','FBA140BVMA'].map(model=>({brand:'Daikin' as const,model,type:'Slimline' as const})),
  ...['FDYBA25AV1','FDYBA35AV1','FDYBA50AV1','FDYBA60AV1'].map(model=>({brand:'Daikin' as const,model,type:'Bulkhead' as const})),
  ...['FDYUA71AV1','FDYUA100AV1','FDYUA125AV1','FDYUA140AV1'].map(model=>({brand:'Daikin' as const,model,type:'Underfloor' as const})),
  ...['PEAD-M50JAAD','PEAD-M60JAAD','PEAD-M71JAAD','PEAD-M100JAAD','PEAD-M125JAAD','PEAD-M140JAAD','PEA-M100GAA','PEA-M125GAA','PEA-M140GAA','PEA-M100HAA','PEA-M125HAA','PEA-M140HAA'].map(model=>({brand:'Mitsubishi Electric' as const,model,type:'Standard Ducted' as const})),
  ...['SEZ-M25DA3','SEZ-M35DA3','SEZ-M50DA3','SEZ-M60DA3','SEZ-M71DA3'].map(model=>({brand:'Mitsubishi Electric' as const,model,type:'Bulkhead' as const})),
  ...['CRS10','CRS13','CRS15','CRS17','CRS20','CRS23','CRV13','CRV15','CRV17','CRV20','CRV23'].map(model=>({brand:'ActronAir' as const,model,type:'Standard Ducted' as const})),
  ...['LRC10','LRC13','LRC15','LRC17'].map(model=>({brand:'ActronAir' as const,model,type:'Slimline' as const})),
];

export const UNIT_TYPES: UnitType[] = ['Standard Ducted','Slimline','Bulkhead','Underfloor'];
