<?php

namespace App\Services\Records;

use App\Exceptions\ApiException;
use App\Services\SqlIdentifier;

final class FilterCompiler
{
    private array $bindings = [];

    public function compile(?array $expression, array $fields): array
    {
        $this->bindings = [];
        if ($expression === null) {
            return ['sql' => 'TRUE', 'bindings' => []];
        }
        $map = collect($fields)->keyBy('field_id')->all();
        $sql = $this->expression($expression, $map);

        return ['sql' => $sql, 'bindings' => $this->bindings];
    }

    private function expression(array $node, array $fields): string
    {
        if (($node['kind'] ?? null) === 'group') {
            $children = $node['children'] ?? [];
            if (! is_array($children) || $children === []) {
                return 'TRUE';
            }
            $join = ($node['conjunction'] ?? null) === 'or' ? ' OR ' : ' AND ';

            return '('.implode($join, array_map(fn (array $child): string => $this->expression($child, $fields), $children)).')';
        }
        $field = $fields[$node['fieldId'] ?? ''] ?? null;
        $operator = $node['operator'] ?? '';
        if (! $field) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'Unknown filter field');
        }
        $this->assertOperatorAllowed($field->field_type, $operator);
        $column = SqlIdentifier::quote($field->physical_column_name);
        if ($operator === 'is_empty') {
            return "({$column} IS NULL OR {$column}::text = '')";
        }
        if ($operator === 'is_not_empty') {
            return "({$column} IS NOT NULL AND {$column}::text <> '')";
        }
        if ($operator === 'is_any_of') {
            if (! is_array($node['value'] ?? null)) {
                throw new ApiException(400, 'VALIDATION_ERROR', 'is_any_of filters require an array value');
            }
            $values = $node['value'];
            if ($values === []) {
                return 'FALSE';
            }
            $this->bindings = [...$this->bindings, ...$values];

            return "{$column} IN (".implode(', ', array_fill(0, count($values), '?')).')';
        }
        $sqlOperator = ['equals' => '=', 'not_equals' => '<>', 'contains' => 'ILIKE', 'starts_with' => 'ILIKE', 'gt' => '>', 'gte' => '>=', 'lt' => '<', 'lte' => '<=', 'before' => '<', 'after' => '>'][$operator] ?? null;
        if (! $sqlOperator) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'Filter operator is invalid');
        }
        $value = $node['value'] ?? null;
        if ($operator === 'contains') $value = '%'.(string) $value.'%';
        if ($operator === 'starts_with') $value = (string) $value.'%';
        $this->bindings[] = $value;

        return "{$column} {$sqlOperator} ?";
    }

    private function assertOperatorAllowed(string $type, string $operator): void
    {
        $text = ['equals', 'not_equals', 'contains', 'starts_with', 'is_empty', 'is_not_empty', 'is_any_of'];
        $ordered = ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'is_empty', 'is_not_empty', 'is_any_of'];
        $boolean = ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
        $allowed = match ($type) {
            'boolean' => $boolean,
            'short_text', 'long_text', 'email', 'url', 'phone', 'single_select' => $text,
            default => $ordered,
        };
        if (! in_array($operator, $allowed, true)) {
            throw new ApiException(400, 'VALIDATION_ERROR', "{$operator} is not allowed for {$type} fields");
        }
    }
}
