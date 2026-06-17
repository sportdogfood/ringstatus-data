# Class Order-Of-Go Evidence

Authority: browser-captured URL and HTML fragment evidence.

## Verified URL

```text
https://www.horseshowing.com/class_oog.php?class_no=28587
```

## Verified Response Type

HTML fragment/document containing order-of-go tables.

Observed status text:

```html
<div id="order_option"><b>NOT A POSTED ORDER</b></div>
```

## Verified Payload Shape

Large layout:

```html
<div class="lg">
  <table class="table-condensed orders_table">
    <tr>
      <th>#</th>
      <th>Entry No.</th>
      <th>Horse</th>
      <th>Rider</th>
      <th>Trainer</th>
    </tr>
  </table>
</div>
```

Small layout:

```html
<div class="sm">
  <table class="table-condensed orders_table">
    <tr>
      <th>#</th>
      <th>Entry No.</th>
      <th>Horse</th>
      <th>Rider</th>
    </tr>
  </table>
</div>
```

Observed row values for `class_no=28587`:

```text
1 | 1856 | Zara Www       | Kate Phillips  | Manuel G. Torres
2 | 1939 | Harry D'ete RW | Amanda Carroll | Christoph Schroeder
```

## Capability Mapping

- `classes`: available by `class_no`
- `entries`: available as `Entry No.`
- `horses`: available
- `riders`: available
- `trainers`: available in large layout
- `go_order`: available as row number
- `posted_order_status`: available from `#order_option`
- `trips`: not provided
- `live_trips`: not provided
- `results`: not provided

Important limitation: observed `#order_option` says `NOT A POSTED ORDER`, so the
rows may be entries/listing order rather than a confirmed posted order. Preserve
that status in normalized output.
