import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VisualWorkflow } from '../../apps/web/src/VisualWorkflow';
import type { ProjectDetail } from '../../packages/shared/types';
const project = { id:'test-project',state:{status:'interrupted',invalidation:{reason:'Historical diagnostic reason',at:'2026-11-01',affected:['analyst'],from:'analyst'},stages:{analyst:{status:'completed'},builder:{status:'pending'}}},intent:{visual_constraints:[{origin:'default',requirement:'System font',basis:'Offline rendering'}]},asset_observations:[] } as unknown as ProjectDetail;
function App(){const [tick,setTick]=useState(0);return <main style={{maxWidth:900,margin:'auto'}}><button data-refresh onClick={()=>setTick(value=>value+1)}>Poll {tick}</button><VisualWorkflow project={{...project,updated_at:String(tick)}} operate={async()=>{}}/><div style={{height:1200}}/></main>;}
createRoot(document.getElementById('root')!).render(<App/>);
