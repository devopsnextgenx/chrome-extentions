create a chrome extention to allow downloading images from the given div/element selected on page
- it should allow to show a popup with button to start selecting element/div.
- enable download button when element is selected, and highlight selected element in page
- it should have input box which has default location, allow to change default location for save, make sure it persists across sessions
- provide actress name as input box for creating parent folder in default location, make sure it persists across sessions
- it should have ability to generate a name for folder from url segment, we should be able to configure the segment index based on url domain, create this folder in actress name parent folder
        - https://starzone.ragalahari.com/april2009/starzone/sada11/sada1152t.jpg should use sada11 as folder name
        - https://www.idlebrain.com/movie/photogallery/sada19/images/th_sada90.jpg should use sada19 as folder name which is previous segment path before images
- it should adjust image name based on if they are thumbnain or not, 
        - https://starzone.ragalahari.com/april2009/starzone/sada11/sada1152t.jpg should resolve to https://starzone.ragalahari.com/april2009/starzone/sada11/sada1152.jpg (remove t before jpg)
        - https://www.idlebrain.com/movie/photogallery/sada19/images/th_sada90.jpg (th_ removed from file name)
- download images to folder name generated from url segment
- show progress for downloaded images and pending images numbers and progress bar as well.
so, the popup should look like this:
- two buttons
    - select element
    - download
- input box for default location
- input box for actress name
make sure when element select is clicked, we do not hide the popup, and only hide popup when download button is clicked
- we should progress in separate popup, and it has close button to close it.
- progress popup should show progress bar and number of images downloaded and pending images numbers and total images to download

Through out the UI make sure it is consistent and follow dark theme