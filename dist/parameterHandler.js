import { z } from "zod";
export class ParameterValidator {
    /**
     * Validate parameters and generate user-friendly error messages for missing required params
     */
    static validateParameters(toolDef, input) {
        try {
            // First try to parse with Zod schema
            const validatedInput = toolDef.inputSchema.parse(input);
            return {
                isValid: true,
                missingParams: [],
                validationErrors: [],
                validatedInput
            };
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                const missingParams = [];
                const validationErrors = [];
                for (const issue of error.issues) {
                    const fieldPath = issue.path.join('.');
                    const paramPrompt = toolDef.parameterPrompts.find(p => p.name === fieldPath);
                    if (issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined') {
                        // Missing required parameter
                        if (paramPrompt && paramPrompt.required) {
                            missingParams.push(paramPrompt);
                        }
                    }
                    else {
                        // Other validation errors
                        validationErrors.push(`Parameter '${fieldPath}': ${issue.message}`);
                        if (paramPrompt) {
                            validationErrors.push(`  Expected: ${paramPrompt.description}`);
                            if (paramPrompt.examples) {
                                validationErrors.push(`  Examples: ${paramPrompt.examples.join(', ')}`);
                            }
                        }
                    }
                }
                return {
                    isValid: false,
                    missingParams,
                    validationErrors
                };
            }
            // Unknown validation error
            return {
                isValid: false,
                missingParams: [],
                validationErrors: [`Validation failed: ${error}`]
            };
        }
    }
    /**
     * Generate user-friendly prompt for missing parameters
     */
    static generateParameterPrompt(toolName, missingParams) {
        const lines = [
            `Tool '${toolName}' requires the following parameters:`,
            ""
        ];
        for (const param of missingParams) {
            lines.push(`**${param.name}** (${param.required ? 'required' : 'optional'})`);
            lines.push(`  ${param.description}`);
            if (param.examples && param.examples.length > 0) {
                lines.push(`  Examples: ${param.examples.join(', ')}`);
            }
            if (param.validation) {
                const validation = param.validation;
                if (validation.min !== undefined || validation.max !== undefined) {
                    lines.push(`  Range: ${validation.min ?? 'any'} to ${validation.max ?? 'any'}`);
                }
                if (validation.options) {
                    lines.push(`  Valid options: ${validation.options.join(', ')}`);
                }
                if (validation.pattern) {
                    lines.push(`  Pattern: ${validation.pattern}`);
                }
            }
            if (param.defaultValue !== undefined) {
                lines.push(`  Default: ${param.defaultValue}`);
            }
            lines.push("");
        }
        lines.push("Please provide these parameters and try again.");
        return lines.join('\n');
    }
    /**
     * Generate validation error message
     */
    static generateValidationErrorMessage(toolName, validationErrors) {
        const lines = [
            `Tool '${toolName}' parameter validation failed:`,
            ""
        ];
        for (const error of validationErrors) {
            lines.push(`  • ${error}`);
        }
        lines.push("");
        lines.push("Please correct the parameters and try again.");
        return lines.join('\n');
    }
}
/**
 * Helper function to create parameter prompts from Zod schema
 */
export function createParameterPrompts(schema, customPrompts = {}) {
    const prompts = [];
    if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        for (const [key, fieldSchema] of Object.entries(shape)) {
            const custom = customPrompts[key] || {};
            const isOptional = isZodOptional(fieldSchema);
            const prompt = {
                name: key,
                description: custom.description || `Parameter: ${key}`,
                required: !isOptional,
                type: getZodType(fieldSchema),
                examples: custom.examples,
                validation: custom.validation,
                defaultValue: custom.defaultValue
            };
            // Extract default value from Zod schema if available
            if (fieldSchema instanceof z.ZodDefault) {
                prompt.defaultValue = fieldSchema._def.defaultValue();
                prompt.required = false;
            }
            prompts.push(prompt);
        }
    }
    return prompts;
}
function isZodOptional(schema) {
    return schema instanceof z.ZodOptional ||
        schema instanceof z.ZodDefault ||
        (schema._def && schema._def.typeName === 'ZodOptional');
}
function getZodType(schema) {
    if (schema instanceof z.ZodString)
        return 'string';
    if (schema instanceof z.ZodNumber)
        return 'number';
    if (schema instanceof z.ZodBoolean)
        return 'boolean';
    if (schema instanceof z.ZodArray)
        return 'array';
    if (schema instanceof z.ZodOptional)
        return getZodType(schema.unwrap());
    if (schema instanceof z.ZodDefault)
        return getZodType(schema.removeDefault());
    return 'string'; // fallback
}
