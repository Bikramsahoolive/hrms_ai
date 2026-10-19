import  {Server}  from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import 'dotenv/config';


const API_BASE_URL = process.env.API_URL || "";

// Initialize the MCP Server instance
const server = new Server(
  {
    name: "HRMS-data-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * 1. Register available tools exposed to the LLM
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_all_employees_count",
        description:
          "Fetches the count of all employee records from the API. Returns total, active, inactive, and left employee counts.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },{
        name: "check_leave_balance",
        description:
          "Checks the leave balance for a specific employee.",
        inputSchema: {
          type: "object",
          properties: {
            employee: {
              type: "string",
              description: "The ID of the employee whose leave balance is to be checked.",
            },
            requested_user_id:{
                    type: "string",
                    description: "The ID of the user making the request. This is used for authorization and auditing purposes."
            }
          },
          required: ["employee","requested_user_id"],
        },
      },
      {
        name: "attendance_details",
        description:
          "Fetches the attendance details for a specific employee.",
        inputSchema: {
          type: "object",
          properties: {
            requested_user_id: {
              type: "string",
              description: "The ID of the user making the request. This is used for authorization and auditing purposes.",
            },
            employee: {
              type: "array",
              description: "The ID of the employee whose attendance details are to be fetched like ['PTPL000'] and for multiple ['PTPL000','PTPL111'] and  ['ALL'] for all employees.",
              items: {
                    type: "string"
                },
            },
            fromDate: {
              type: "string",
              format: "date",
              description: "The start date for which attendance details are to be fetched, use ISO 8601 format: YYYY-MM-DD (e.g., 2026-09-09). Do not use MM/DD/YYYY or DD/MM/YYYY.",
            },
            toDate: {
              type: "string",
              format: "date",
              description: "The end date for which attendance details are to be fetched, use ISO 8601 format: YYYY-MM-DD (e.g., 2026-09-09). Do not use MM/DD/YYYY or DD/MM/YYYY.",
            },
            status: {
              type: "array",
              description: "The status of the attendance records to be fetched ['Present'] (e.g., Present, Absent, Half Day, On Leave), for multiple statuses, provide an array of strings, given as ['Present', 'Half Day'], or ['ALL'] for all statuses.",
              items: {
                    type: "string"
                },
            },
          },
          required: ["requested_user_id", "employee", "fromDate", "toDate", "status"],
        },
      },
      {
        name: "pending_requests_details",
        description:
          "Fetches the details of pending requests like Attendance Request(OD, WFH), Leave Application, Mixed Work, Missed Biometrics Request",
        inputSchema: {
          type: "object",
          properties: {
            requested_user_id: {
              type: "string",
              description: "The ID of the user making the request. This is used for authorization and auditing purposes.",
            },
            request_for:{
              type: "string",
              description: "For On Duty (OD) or Work From Home use 'Attendance Request', For Leave related use 'Leave Application', for Missed Biomatrics or punch use 'Missed Biomatric', for Mixed Work related use 'Mixed Work', Default use 'ALL'",

            },
            employee: {
              type: "array",
              description: "The ID of the employee whose attendance details are to be fetched like ['PTPL000'] and for multiple ['PTPL000','PTPL111'] and  ['ALL'] for all employees.",
              items: {
                    type: "string"
                },
            },
            fromDate: {
              type: "string",
              format: "date",
              description: "The start date for which request details are to be fetched, use ISO 8601 format: YYYY-MM-DD (e.g., 2026-09-09). Do not use MM/DD/YYYY or DD/MM/YYYY, Default current month start date.",
            },
            toDate: {
              type: "string",
              format: "date",
              description: "The end date for which request details are to be fetched, use ISO 8601 format: YYYY-MM-DD (e.g., 2026-09-09). Do not use MM/DD/YYYY or DD/MM/YYYY, Default current month end date.",
            },
            reason: {
              type: "string",
              description: "Can be 'On Duty' (OD) or 'Work From Home' (wfh) Only for Attendance Request Other wise 'None'",
            },
          },
          required: ["requested_user_id", "employee", "fromDate", "toDate", "reason","request_for"]
        }
      },
      {
        name: "create_leave_request",
        description:
          "Creates a new leave request for an employee.",
        inputSchema: {
          type: "object",
          properties: {
            employee: {
              type: "string",
              description: "The ID of the employee requesting leave.",
            },
            leaveType: {
              type: "string",
              description: "The type of leave being requested (Earned Leave, Compensatory Off, Paternity Leave) default is Earned Leave.",
            },
            startDate: {
              type: "string",
              format: "date",
              description: "The start date of the leave period. use ISO 8601 format: YYYY-MM-DD (e.g., 2026-09-09). Do not use MM/DD/YYYY or DD/MM/YYYY.",
            },
            endDate: {
              type: "string",
              format: "date",
              description: "The end date of the leave period. use ISO 8601 format: YYYY-MM-DD (e.g., 2026-09-09). Do not use MM/DD/YYYY or DD/MM/YYYY.",
            },
            reason: {
              type: "string",
              description: "The reason for the leave request, can correct if wrong.",
            },
            halfDay: {
              type: "number",
              description: "Indicates if the leave is for a half day 1 else 0.",
            },
            requested_user_id: {
              type: "string",
              description: "The ID of the user making the request. This is used for authorization and auditing purposes.",
            },
          },
          required: ["employee", "leaveType", "startDate", "endDate", "reason", "halfDay"],
        },
      }
    ],
  };
});

/**
 * 2. Handle execution when an LLM invokes a tool
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_all_employees_count") {

    try {
      // Execute REST API request
        const response = await fetch(`${API_BASE_URL}chat_employee`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP Error status: ${response.status}`);
      }

      // Parse JSON payload from Frappe/ERPNext response
      const data = await response.json();


     

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                totalEmployeeCount: data.message.total,
                totalActiveEmployeeCount: data.message.active,
                totalInactiveEmployeeCount: data.message.inactive,
                totalLeftEmployeeCount: data.message.left,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error.response
        ? `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`
        : error.message;

      return {
        content: [
          {
            type: "text",
            text: `Failed to fetch employee count: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (request.params.name === "attendance_details") {
    // Handle attendance_details tool
    console.log("Received attendance_details tool invocation with input:", request.params.arguments);
    const { requested_user_id, employee, fromDate, toDate, status } = request.params.arguments || {};

    try {
        const response = await fetch(`${API_BASE_URL}attendance_details`, {
          method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
          body: JSON.stringify({
            requested_user_id,
            employee,
            fromDate,
            toDate,
            status
          }),
        });

        const data = await response.json();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error.response
          ? `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`
          : error.message;

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch attendance details: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

  if (request.params.name === "check_leave_balance") {
    // Handle check_leave_balance tool
    console.log("Received check_leave_balance tool invocation with input:", request.params.arguments);
    const { employee,requested_user_id } = request.params.arguments || {};

    try {
        const response = await fetch(`${API_BASE_URL}check_leave_balance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employee,
            requested_user_id
          }),
        });

        const data = await response.json();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error.response
          ? `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`
          : error.message;

        return {
          content: [
            {
              type: "text",
              text: `Failed to check leave balance: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }


    if (request.params.name === "pending_requests_details"){

      try {
        const { employee,requested_user_id,fromDate,toDate,reason,request_for } = request.params.arguments || {};
        const response = await fetch(`${API_BASE_URL}pending_requests_details`,{
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employee,
            requested_user_id,
            request_for,
            fromDate,
            toDate,
            reason
          }),
        });

        const data = await response.json();

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
      } catch (error) {
        const errorMessage = error.response
          ? `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`
          : error.message;

        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch pending requests count: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

  if (request.params.name === "create_leave_request") {
    // Handle create_leave_request tool
    console.log("Received create_leave_request tool invocation with input:", request.params.arguments);
    const { requested_user_id,employee, leaveType, startDate, endDate, reason,halfDay } = request.params.arguments || {};

    try {
        const response = await fetch(`${API_BASE_URL}create_leave_request`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requested_user_id,
            employee,
            leaveType,
            startDate,
            endDate,
            reason,
            halfDay
          }),
        });

        // if (!response.ok) {
        //   throw new Error(`HTTP Error status: ${response.status}`);
        // }

        const data = await response.json();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error.response
          ? `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`
          : error.message;

        return {
          content: [
            {
              type: "text",
              text: `Failed to create leave request: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  

  throw new Error(`Tool not found: ${request.params.name}`);
});

/**
 * 3. Connect via Standard I/O (Stdio) transport
 */
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HRMS MCP Server active and running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running MCP server:", error);
  process.exit(1);
});