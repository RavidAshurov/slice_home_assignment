const FUNCTION_CODES = {
  SEND_EMAIL: 'SEND_EMAIL',
  UPDATE_GRANT_STATUS: 'UPDATE_GRANT_STATUS',
  ALWAYS_FAIL: 'ALWAYS_FAIL', // This function always fails to test the workflow engine
}

const WORKFLOW_FUNCTIONS = {
  [FUNCTION_CODES.SEND_EMAIL]: async (grant, payload) => {
    await new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Email sent to employee ${grant.employee?.id}`)
        resolve()
      }, 1000)
    })
  },
  [FUNCTION_CODES.UPDATE_GRANT_STATUS]: async (grant, payload) => {
    await new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Grant ${grant.id} status was updated to ${payload.status}`)
        resolve()
      }, 1000)
    })
  },
  [FUNCTION_CODES.ALWAYS_FAIL]: async () => {
    // This function always fails to test the workflow engine
    console.log(`Updating grant status...`)
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Step failed')
        reject('THIS STEPS ALWAYS FAILS')
      }, 1000)
    })
  },
}

const WORKFLOW_STATUSES = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
}

const WORKFLOW_STEP_STATUSES = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
}

async function executeWorkflow(workflow, payload) {
  workflow.status = WORKFLOW_STATUSES.IN_PROGRESS
  let stepsReadyToExecute = getStepsToExecute(workflow)
  while (stepsReadyToExecute.length) {
    const stepsResults = await Promise.allSettled(
      stepsReadyToExecute.map((step) => executeStep(step, payload))
    )

    stepsResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        cutOffDependencyBranch(workflow, stepsReadyToExecute[index])
      }
    })
    stepsReadyToExecute = getStepsToExecute(workflow)
  }
  workflow.status = workflow.steps.some((step) => step.status === WORKFLOW_STEP_STATUSES.FAILED)
    ? WORKFLOW_STATUSES.FAILED
    : WORKFLOW_STATUSES.SUCCESS
  console.log(`Workflow execution completed with status: ${workflow.status}`)
  console.log(
    'Final workflow steps status:\n',
    workflow.steps.map((step) => `${step.id}: ${step.status}`).join('\n')
  )
  return workflow
}

function getStepsToExecute(workflow) {
  const completedSteps = workflow.steps
    .filter((step) => step.status === WORKFLOW_STEP_STATUSES.SUCCESS)
    .map((step) => step.id)

  const stepsReadyToExecute = workflow.steps.filter(
    (step) =>
      step.status === WORKFLOW_STEP_STATUSES.PENDING &&
      step.dependencies.every((dependency) => completedSteps.includes(dependency))
  )

  return stepsReadyToExecute
}

async function executeStep(step, workflowPayload) {
  step.status = WORKFLOW_STEP_STATUSES.IN_PROGRESS
  try {
    await WORKFLOW_FUNCTIONS[step.function_code](workflowPayload, step.payload)
    step.status = WORKFLOW_STEP_STATUSES.SUCCESS
    console.log(`Step ${step.id} executed successfully`)
  } catch (err) {
    step.status = WORKFLOW_STEP_STATUSES.FAILED
    console.error(`Error executing step ${step.id}:`, err)
    throw err
  }
}

function cutOffDependencyBranch(workflow, step) {
  const stepsIds = new Set([step.id])
  const stepsCutOffFilter = (step) =>
    step.status == WORKFLOW_STEP_STATUSES.PENDING &&
    step.dependencies.some((dependencyId) => stepsIds.has(dependencyId))

  let stepsToCutOff = workflow.steps.filter(stepsCutOffFilter)

  while (stepsToCutOff.length) {
    stepsToCutOff.forEach((s) => {
      s.status = WORKFLOW_STEP_STATUSES.SKIPPED
      console.log(`Step ${s.id} skipped due to failure of step ${step.id}`)
      stepsIds.add(s.id)
    })
    stepsToCutOff = workflow.steps.filter(stepsCutOffFilter)
  }
}

// ------------------ TESTING ------------------
const exampleGrantRecord = {
  id: 43784,
  name: 'Employee grant 2024',
  amount: 1000,
  date: '2024-01-01',
  employee: {
    id: 123,
    name: 'John Doe',
  },
}
const testWorkflow1 = {
  id: 1,
  name: 'Example Workflow',
  status: WORKFLOW_STATUSES.PENDING,
  steps: [
    {
      id: 'G1',
      name: 'Grant 1',
      payload: {
        status: 'PENDING_APPROVAL',
      },
      function_code: FUNCTION_CODES.UPDATE_GRANT_STATUS,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: [],
    },
    {
      id: 'G2',
      name: 'Grant 2',
      payload: {
        status: 'PENDING_APPROVAL',
      },
      function_code: FUNCTION_CODES.UPDATE_GRANT_STATUS,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: [],
    },
    {
      id: 'G3',
      name: 'Grant 3',
      payload: {
        status: 'PENDING_APPROVAL',
      },
      function_code: FUNCTION_CODES.UPDATE_GRANT_STATUS,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: [],
    },
    {
      id: 'E1',
      name: 'Email 1',
      function_code: FUNCTION_CODES.SEND_EMAIL,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['G1', 'G2', 'G3'],
    },
    {
      id: 'E2',
      name: 'Email 2',
      function_code: FUNCTION_CODES.SEND_EMAIL,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['G3'],
    },
    {
      id: 'E3',
      name: 'Email 3',
      function_code: FUNCTION_CODES.SEND_EMAIL,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['E1'],
    },
    {
      id: 'E4',
      name: 'Email 4',
      function_code: FUNCTION_CODES.SEND_EMAIL,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['E1', 'E2'],
    },
  ],
}
const expectedResults1 = {
  status: WORKFLOW_STATUSES.SUCCESS,
  steps: {
    G1: WORKFLOW_STEP_STATUSES.SUCCESS,
    G2: WORKFLOW_STEP_STATUSES.SUCCESS,
    G3: WORKFLOW_STEP_STATUSES.SUCCESS,
    E1: WORKFLOW_STEP_STATUSES.SUCCESS,
    E2: WORKFLOW_STEP_STATUSES.SUCCESS,
    E3: WORKFLOW_STEP_STATUSES.SUCCESS,
    E4: WORKFLOW_STEP_STATUSES.SUCCESS,
  },
}
const testWorkflow2 = {
  id: 4,
  name: 'Test Workflow 3',
  status: WORKFLOW_STATUSES.PENDING,
  steps: [
    {
      id: 'X1',
      name: 'Task 1',
      payload: {
        status: 'REQUESTED',
      },
      function_code: FUNCTION_CODES.UPDATE_GRANT_STATUS,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: [],
    },
    {
      id: 'X2',
      name: 'Task 2',
      function_code: FUNCTION_CODES.SEND_EMAIL,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['X1'],
    },
    {
      id: 'X3',
      name: 'Task 3',
      payload: {
        status: 'PENDING_APPROVAL',
      },
      function_code: FUNCTION_CODES.UPDATE_GRANT_STATUS,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['X1'],
    },
    {
      id: 'X4',
      name: 'Task 4',
      function_code: FUNCTION_CODES.SEND_EMAIL,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['X2', 'X3'],
    },
    {
      id: 'X5',
      name: 'Task 5',
      function_code: FUNCTION_CODES.ALWAYS_FAIL,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['X4'],
    },
    {
      id: 'X6',
      name: 'Task 6',
      function_code: FUNCTION_CODES.SEND_EMAIL,
      status: WORKFLOW_STEP_STATUSES.PENDING,
      status_data: {},
      dependencies: ['X5'],
    },
  ],
}
const expectedResults2 = {
  status: WORKFLOW_STATUSES.FAILED,
  steps: {
    X1: WORKFLOW_STEP_STATUSES.SUCCESS,
    X2: WORKFLOW_STEP_STATUSES.SUCCESS,
    X3: WORKFLOW_STEP_STATUSES.SUCCESS,
    X4: WORKFLOW_STEP_STATUSES.SUCCESS,
    X5: WORKFLOW_STEP_STATUSES.FAILED,
    X6: WORKFLOW_STEP_STATUSES.SKIPPED,
  },
}
async function testWorkflowExecutionWithSteps(workflow, payload, expectedResults) {
  console.log(`Testing workflow: ${workflow.name}`)
  const res = await executeWorkflow(workflow, payload)
  let testPassed = true

  if (res.status !== expectedResults.status) {
    console.error(
      `Test failed: Workflow "${workflow.name}" completed with status "${result.status}" instead of "${expectedResults.status}".`
    )
    testPassed = false
  } else {
    console.log(
      `Workflow "${workflow.name}" completed with expected status "${expectedResults.status}".`
    )
  }

  if (testPassed) {
    for (const step of res.steps) {
      const expectedStepStatus = expectedResults.steps[step.id]
      if (step.status !== expectedStepStatus) {
        console.error(
          `Test failed: Step "${step.id}" status "${step.status}". expected: "${expectedStepStatus}".`
        )
        testPassed = false
        break
      } else {
        console.log(`Step "${step.id}" match expected status "${expectedStepStatus}".`)
      }
    }
  }

  if (testPassed) {
    console.log(`All tests passed for workflow "${workflow.name}"!`)
  } else {
    console.error(`Some tests failed for workflow "${workflow.name}".`)
  }
}
async function runTests() {
  // Defined to make the tests run one after the other for readability
  await testWorkflowExecutionWithSteps(testWorkflow1, exampleGrantRecord, expectedResults1)
  await testWorkflowExecutionWithSteps(testWorkflow2, exampleGrantRecord, expectedResults2)
}
runTests()
