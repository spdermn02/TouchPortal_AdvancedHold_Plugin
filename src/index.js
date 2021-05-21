const TPClient = new (require('touchportal-api').Client)();

const pluginId = 'TouchPortal_AdvancedHold';
const updateUrl = "https://raw.githubusercontent.com/spdermn02/TouchPortal_AdvancedHold_Plugin/master/package.json";

const HOLD_TRIGGER_STATE_NAME = 'Advanced_Hold_State';
const HOLD_TRIGGER_INFINITE_STATE_NAME = 'Advanced_Hold_Infinite_State';
const MAX_INFINITE_COUNT = 100000;

let numStates = 0;
let numInfiniteStates = 0;
let settings = {};
let existingStates = {};
let infiniteStates = {};
let heldAction = {};
let infiniteActions = {};

TPClient.on("Action", (message,hold) => {
  console.log(pluginId, ": DEBUG : ACTION ", JSON.stringify(message), "hold", hold);

  if( hold ) {
    heldAction[message.data[0].value] = true;
  }
  else if ( hold === false ) {
    delete heldAction[message.data[0].value];
    return; //do not continue, don't need this to trigger the holdtrigger_action
  }

  if (message.actionId === "advancedhold_action") {
    advancedHoldAction(message,hold);
  }
  else if( message.actionId === "advancedhold_infinite_action") {
    advancedHoldInfiniteAction(message);
  }
  else if( message.actionId === "advancedhold_stop_infinite_specific_action" ){
    advancedHoldStopSpecificInfiniteAction(message);
  }
  else if( message.actionId === "advancedhold_stop_infinite_all_action" ){
    advancedHoldStopAllInfiniteAction();
  }
});

/* Functions */
const advancedHoldAction = async (message, hold) => {
  const factor = ( message.data[2].value == 'milliseconds' ) ? 1 : 1000;
  let timeMSeconds = parseInt(message.data[1].value,10) * factor;
  timeMSeconds = ( timeMSeconds < 100 ) ? 100 : timeMSeconds; //Only allow min of 100 milliseconds (until I get action update validation fixed)
  const heldState = message.data[0].value;
  while( hold === undefined || heldAction[heldState] ) {
    await new Promise(r => setTimeout(r,timeMSeconds));
    if( hold === undefined || heldAction[heldState] === undefined ) { 
      existingStates[heldState].value = 0;
      break; 
    }
    TPClient.stateUpdate(heldState,++existingStates[heldState].value);
  }
  TPClient.stateUpdate(heldState,existingStates[heldState].value);
};

const advancedHoldInfiniteAction = message => {
  const factor = ( message.data[2].value == 'milliseconds' ) ? 1 : 1000;
  let timeMSeconds = parseInt(message.data[1].value,10) * factor;
  timeMSeconds = ( timeMSeconds < 100 ) ? 100 : timeMSeconds; //Only allow min of 100 milliseconds (until I get action update validation fixed)
  const heldState = message.data[0].value;
  infiniteLoop(heldState,timeMSeconds);
};

const infiniteLoop = (stateId, timeMSeconds) => {
  logIt('DEBUG',`infiniteLoop started for state id: ${stateId}`);
    const loopMe = sid => {
      TPClient.stateUpdate(sid,++infiniteStates[sid].value);
      if( infiniteStates[sid].value >= MAX_INFINITE_COUNT ){
        infiniteStates[sid].value = 0;
      }
    }
    let infiniteInterval = setInterval( _ => { loopMe(stateId) }, timeMSeconds);
    infiniteActions[stateId] = infiniteInterval;
};

const advancedHoldStopSpecificInfiniteAction = message => {
  const stateId = message.data[0].value;
  if(! infiniteActions.hasOwnProperty(stateId) ) {
    logIt('WARN',`State Id ${stateId} was not being set to infinite hold`);
    return;
  }
  clearInterval(infiniteActions[stateId]);
  delete infiniteActions[stateId];
  infiniteStates[stateId].value = 0
  TPClient.stateUpdate(stateId,infiniteStates[stateId].value);
};

const advancedHoldStopAllInfiniteAction = _ => {
  const updateStates = [];
  Object.keys(infiniteActions).forEach( stateId => {
    clearInterval(infiniteActions[stateId]);
    delete infiniteActions[stateId];
    infiniteStates[stateId].value = 0
    updateStates.push({'id': stateId, 'value': infiniteStates[stateId].value});
  });
  TPClient.stateUpdateMany(updateStates);
};

/* End Functions */

TPClient.on("Info", (data) => {
  //TP Is connected now
  logIt('DEBUG','We are connected, received Info message');
});

// Touch Portal Client Setup
TPClient.on("Settings", async (data) => {
  logIt('DEBUG',JSON.stringify(data));
    if( data ) {
        data.forEach( (setting) => {
          let key = Object.keys(setting)[0];
          if( settings[key] === setting[key] ) return;
          settings[key] = setting[key];
        });

        if( parseInt(settings['Advanced Hold States']) > 0 ){
            let newNumStates = parseInt(settings['Advanced Hold States'],10);
            if( newNumStates < numStates) {
              let nextState = numStates;
              for( let i = nextState; i > newNumStates; i-- ) {
                let oldState = `${HOLD_TRIGGER_STATE_NAME}_${i}`;
                TPClient.removeState(oldState);
                delete existingStates[oldState];
              }
              numStates = newNumStates
            }
            if( newNumStates > numStates ) {
               let nextState = numStates + 1;
               for( let i = nextState; i <= newNumStates; i++ ) {
                 let newState = `${HOLD_TRIGGER_STATE_NAME}_${i}`;
                 existingStates[newState] = { value: 0 };
                 TPClient.createState(newState,`Advanced Hold State ${i}`, "0");
               }
               numStates = newNumStates;
            }
        }
        if( parseInt(settings['Advanced Hold Infinite States']) > 0 ){
          let newNumStates = parseInt(settings['Advanced Hold Infinite States'],10);
          if( newNumStates < numInfiniteStates) {
            let nextState = numInfiniteStates;
            for( let i = nextState; i > newNumStates; i-- ) {
              let oldState = `${HOLD_TRIGGER_INFINITE_STATE_NAME}_${i}`;
              TPClient.removeState(oldState);
              delete infiniteStates[oldState];
            }
            numInfiniteStates = newNumStates;
          }
          if( newNumStates > numInfiniteStates ) {
             let nextState = numInfiniteStates + 1;
             for( let i = nextState; i <= newNumStates; i++ ) {
               let newState = `${HOLD_TRIGGER_INFINITE_STATE_NAME}_${i}`;
               infiniteStates[newState] = { value: 0 };
               TPClient.createState(newState,`Advanced Hold Infinite State ${i}`, "0");
             }
             numInfiniteStates = newNumStates;
          }
        }

        let stateList = Object.keys(existingStates).sort();
        TPClient.choiceUpdate('advancedhold_state_id',stateList);
        let infiniteStateList = Object.keys(infiniteStates).sort();
        TPClient.choiceUpdate('advancedhold_infinite_state_id',infiniteStateList);
    }
});
  
function logIt() {
  var curTime = new Date().toISOString();
  var message = [...arguments];
  var type = message.shift();
  console.log(curTime,":",pluginId,":"+type+":",message.join(" "));
}
  
TPClient.connect({ pluginId, updateUrl })