import { z } from "zod";
import { ParameterValidator, ToolDefinition, createParameterPrompts } from "../parameterHandler.js";

const validateParametersSchema = z.object({
  toolName: z.string().describe("Name of the tool to validate parameters for"),
  parameters: z.record(z.any()).describe("Parameters object to validate")
});

export const validateParameters = {
  name: "aws_validate_parameters",
  description: "Validate parameters for any AWS tool before calling it. This helps ensure parameters are correct before execution, preventing errors and providing helpful guidance.",
  inputSchema: validateParametersSchema,
  parameterPrompts: createParameterPrompts(validateParametersSchema, {
    toolName: {
      description: "Name of the tool to validate parameters for (e.g., 'aws_rds_performance_insights_top_sql')",
      examples: ["aws_rds_performance_insights_top_sql", "aws_rds_get_cpu_metrics", "aws_s3_list", "aws_ecs_list_tasks"]
    },
    parameters: {
      description: "Parameters object to validate - the same object you would pass to the actual tool",
      examples: ['{"dbInstanceIdentifier": "mi-test-2"}', '{"bucketName": "my-bucket", "prefix": "logs/"}']
    }
  }),
  handler: async (input: any) => {
    // Import all tools to find the target tool
    const { s3List, s3GetText, s3PutText, s3ListBuckets } = await import("./s3.js");
    const { cwQuery } = await import("./cloudwatch.js");
    const { ecsListTasks } = await import("./ecs.js");
    const { ecrListImages } = await import("./ecr.js");
    const { rdsExecute } = await import("./rdsdata.js");
    const { rdsGetCpuMetrics, rdsGetTopSql } = await import("./rds.js");
    const { athenaQuery } = await import("./athena.js");
    const { stsAssume } = await import("./sts.js");
    const { ceGetCost } = await import("./cost.js");

    const allTools: ToolDefinition[] = [
      s3ListBuckets, s3List, s3GetText, s3PutText,
      cwQuery,
      ecsListTasks,
      ecrListImages,
      rdsExecute,
      rdsGetCpuMetrics,
      rdsGetTopSql,
      athenaQuery,
      stsAssume,
      ceGetCost
    ];

    const tool = allTools.find(t => t.name === input.toolName);
    if (!tool) {
      return {
        valid: false,
        error: `Tool '${input.toolName}' not found`,
        availableTools: allTools.map(t => t.name)
      };
    }

    // Validate the parameters
    const validation = ParameterValidator.validateParameters(tool, input.parameters);

    if (validation.isValid) {
      return {
        valid: true,
        toolName: input.toolName,
        validatedParameters: validation.validatedInput,
        message: "Parameters are valid and ready to use"
      };
    } else {
      // Generate helpful error messages
      let errorMessage = `Parameter validation failed for tool '${input.toolName}':\n\n`;
      
      if (validation.missingParams.length > 0) {
        errorMessage += "Missing required parameters:\n";
        for (const param of validation.missingParams) {
          errorMessage += `  • ${param.name}: ${param.description}\n`;
          if (param.examples) {
            errorMessage += `    Examples: ${param.examples.join(', ')}\n`;
          }
        }
        errorMessage += "\n";
      }
      
      if (validation.validationErrors.length > 0) {
        errorMessage += "Validation errors:\n";
        for (const error of validation.validationErrors) {
          errorMessage += `  • ${error}\n`;
        }
        errorMessage += "\n";
      }

      // Add all parameter information for reference
      errorMessage += "All parameters for this tool:\n";
      for (const param of tool.parameterPrompts) {
        errorMessage += `  • ${param.name} (${param.required ? 'required' : 'optional'}): ${param.description}\n`;
        if (param.examples) {
          errorMessage += `    Examples: ${param.examples.join(', ')}\n`;
        }
        if (param.defaultValue !== undefined) {
          errorMessage += `    Default: ${param.defaultValue}\n`;
        }
      }

      return {
        valid: false,
        toolName: input.toolName,
        error: errorMessage,
        missingParameters: validation.missingParams.map(p => p.name),
        validationErrors: validation.validationErrors,
        parameterGuide: tool.parameterPrompts
      };
    }
  }
};
