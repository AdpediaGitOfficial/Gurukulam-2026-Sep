"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer, DrawerSection } from "@/components/ui/drawer";
import { TextField } from "@/components/ui/input";

/** Live triggers for the two overlay primitives, for the style guide only. */
export function OverlayDemo() {
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setDrawer(true)}>
        Open drawer
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setDialog(true)}>
        Open dialog
      </Button>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Update Country Settings"
        subtitle="India (IND)"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDrawer(false)}>
              Discard
            </Button>
            <Button size="sm" onClick={() => setDrawer(false)}>
              Save Changes
            </Button>
          </>
        }
      >
        <DrawerSection title="Basic information">
          <TextField id="demo-name" label="Country official name" defaultValue="Republic of India" />
          <TextField id="demo-dial" label="Dial code" defaultValue="+91" />
        </DrawerSection>
      </Drawer>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Archive Malaysia?"
        description="Archiving hides the country from operational pickers. The record can be restored later."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDialog(false)}>
              Archive country
            </Button>
          </>
        }
      />
    </>
  );
}
