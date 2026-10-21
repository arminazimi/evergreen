import ast

isinstance(node, ast.Num)  # reported: reference to ast.Num
isinstance(node, ast.Str)  # reported: reference to ast.Str
isinstance(node, ast.Bytes)  # reported: reference to ast.Bytes
isinstance(node, ast.NameConstant)  # reported: reference to ast.NameConstant
isinstance(node, ast.Ellipsis)  # reported: reference to ast.Ellipsis
isinstance(node, ast.Constant)  # not reported: the replacement
isinstance(node, ast.Name)  # not reported: a different node class
